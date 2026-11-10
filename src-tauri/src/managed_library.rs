use super::storage::{atomic_replace, exclusive, Failure, Result};
use serde_json::{json, Value};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub struct ManagedLibrary(PathBuf);

impl ManagedLibrary {
    pub fn new(app_data: &Path, dev: bool) -> Result<Self> {
        let directory = if dev {
            app_data.join("sandbox/library")
        } else {
            app_data.join("library")
        };
        if directory.is_symlink() || (dev && app_data.join("sandbox").is_symlink()) {
            return Err(Failure::new(
                "StorageError",
                "The screenplay library cannot be redirected.",
            ));
        }
        fs::create_dir_all(&directory)?;
        let root = fs::canonicalize(app_data)?;
        let actual = fs::canonicalize(&directory)?;
        let expected = if dev {
            root.join("sandbox/library")
        } else {
            root.join("library")
        };
        if actual != expected {
            return Err(Failure::new(
                "StorageError",
                "The screenplay library cannot be redirected.",
            ));
        }
        Ok(Self(actual))
    }

    fn path(&self, id: &str) -> Result<PathBuf> {
        let uuid = Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id);
        let older_id = id.starts_with("sf-")
            && (5..=100).contains(&id.len())
            && id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
        if !uuid && !older_id {
            return Err(Failure::new("StorageError", "Invalid screenplay ID."));
        }
        Ok(self.0.join(format!("{id}.json")))
    }

    fn read(&self, id: &str) -> Result<Value> {
        let path = self.path(id)?;
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Value::Null),
            Err(error) => return Err(error.into()),
            Ok(metadata) if !metadata.is_file() => {
                return Err(Failure::new("StorageError", "Invalid library file."))
            }
            Ok(_) => {}
        }
        let record: Value = serde_json::from_slice(&fs::read(&path)?)?;
        if record["id"] != id
            || record["recovery"]["document"]["id"] != id
            || record["managed"] != true
        {
            return Err(Failure::new(
                "StorageError",
                format!("Invalid stored screenplay {id}."),
            ));
        }
        Ok(record)
    }

    pub fn run(&self, action: &str, body: &Value) -> Result<Value> {
        if fs::canonicalize(&self.0)? != self.0 {
            return Err(Failure::new(
                "StorageError",
                "The screenplay library cannot be redirected.",
            ));
        }
        match action {
            "library-get" => self.read(body["id"].as_str().unwrap_or("")),
            "library-list" => {
                let mut records = Vec::new();
                for entry in fs::read_dir(&self.0)? {
                    let path = entry?.path();
                    if path.extension().and_then(|part| part.to_str()) != Some("json") {
                        continue;
                    }
                    let id = path
                        .file_stem()
                        .and_then(|part| part.to_str())
                        .unwrap_or("");
                    records.push(self.read(id)?);
                }
                Ok(json!(records))
            }
            "library-put" => {
                let mut record = body["record"].clone();
                let id = record["id"].as_str().unwrap_or("").to_owned();
                let path = self.path(&id)?;
                if record["managed"] != true
                    || record["recovery"]["document"]["id"] != id
                    || !record["handle"].is_null()
                {
                    return Err(Failure::new("StorageError", "Invalid managed screenplay."));
                }
                // Protect revision checking and atomic replacement across app instances.
                let lock_path = self.0.join(".write-lock");
                if lock_path.is_symlink() {
                    return Err(Failure::new(
                        "StorageError",
                        "Invalid screenplay library lock.",
                    ));
                }
                let lock = fs::OpenOptions::new()
                    .read(true)
                    .write(true)
                    .create(true)
                    .truncate(false)
                    .open(lock_path)?;
                lock.lock()?;
                let previous = self.read(&id)?;
                if previous["revision"] != body["revision"] {
                    // An earlier save may have committed before its IPC reply was interrupted.
                    let mut same = previous.clone();
                    if let Some(fields) = same.as_object_mut() {
                        fields.insert("revision".into(), record["revision"].clone());
                    }
                    if same == record {
                        return Ok(previous);
                    }
                    return Err(Failure::new("StorageConflictError", "This screenplay changed in another window. Export a copy to keep your current edits."));
                }
                record["revision"] = json!(previous["revision"].as_u64().unwrap_or(0) + 1);
                let bytes = serde_json::to_vec(&record)?;
                if previous.is_null() {
                    exclusive(&path, &bytes)?;
                } else {
                    atomic_replace(&path, &bytes)?;
                }
                let verified = self.read(&id)?;
                if verified != record {
                    return Err(Failure::new(
                        "StorageError",
                        "Could not verify the saved screenplay.",
                    ));
                }
                Ok(verified)
            }
            _ => Err(Failure::new("StorageError", "Unknown library operation.")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_reopens_and_rejects_conflicts() {
        let data = tempfile::tempdir().unwrap();
        let library = ManagedLibrary::new(data.path(), false).unwrap();
        let id = Uuid::new_v4().to_string();
        let record = json!({"id":id, "managed":true, "title":"One", "recovery":{"document":{"id":id,"elements":[]}}});
        let stored = library
            .run("library-put", &json!({"record":record}))
            .unwrap();
        assert_eq!(stored["revision"], 1);
        let reopened = ManagedLibrary::new(data.path(), false).unwrap();
        assert_eq!(
            reopened.run("library-get", &json!({"id":id})).unwrap(),
            stored
        );
        let mut renamed = stored.clone();
        renamed["title"] = json!("Two");
        assert!(reopened
            .run("library-put", &json!({"record":renamed}))
            .is_err());
        assert_eq!(
            reopened
                .run("library-put", &json!({"record":renamed,"revision":1}))
                .unwrap()["title"],
            "Two"
        );
        assert_eq!(
            fs::read_dir(data.path().join("library")).unwrap().count(),
            2
        );
        assert!(reopened
            .run("library-get", &json!({"id":"../escape"}))
            .is_err());
        let dev_data = tempfile::tempdir().unwrap();
        let dev = ManagedLibrary::new(dev_data.path(), true).unwrap();
        assert_eq!(dev.run("library-list", &json!({})).unwrap(), json!([]));
        assert!(dev_data.path().join("sandbox/library").is_dir());
    }
}

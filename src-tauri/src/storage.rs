use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Failure {
    pub name: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<Value>,
}
pub type Result<T> = std::result::Result<T, Failure>;
impl Failure {
    pub fn new(name: &str, message: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            message: message.into(),
            current: None,
        }
    }
    fn conflict(current: Value) -> Self {
        Self {
            name: "FileConflictError".into(),
            message: "The file changed outside ScriptForge. Review it before replacing it.".into(),
            current: Some(current),
        }
    }
}
impl From<std::io::Error> for Failure {
    fn from(error: std::io::Error) -> Self {
        let name = match error.kind() {
            std::io::ErrorKind::NotFound => "NotFoundError",
            std::io::ErrorKind::PermissionDenied => "FilePermissionError",
            std::io::ErrorKind::InvalidData => "FileEncodingError",
            _ => "Error",
        };
        Self::new(name, error.to_string())
    }
}
impl From<serde_json::Error> for Failure {
    fn from(error: serde_json::Error) -> Self {
        Self::new("StorageError", error.to_string())
    }
}
fn text<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    body.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| Failure::new("Error", format!("Missing {key}.")))
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn sync_parent(path: &Path) -> Result<()> {
    #[cfg(unix)]
    fs::File::open(
        path.parent()
            .ok_or_else(|| Failure::new("Error", "Missing parent folder."))?,
    )?
    .sync_all()?;
    Ok(())
}
fn staged(path: &Path, bytes: &[u8]) -> Result<NamedTempFile> {
    let mut file = NamedTempFile::new_in(
        path.parent()
            .ok_or_else(|| Failure::new("Error", "Missing parent folder."))?,
    )?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    Ok(file)
}
fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<()> {
    let file = staged(path, bytes)?;
    if let Ok(metadata) = fs::metadata(path) {
        file.as_file().set_permissions(metadata.permissions())?;
    }
    file.persist(path)
        .map_err(|error| Failure::from(error.error))?;
    sync_parent(path)
}
fn exclusive(path: &Path, bytes: &[u8]) -> Result<()> {
    staged(path, bytes)?
        .persist_noclobber(path)
        .map_err(|error| Failure::from(error.error))?;
    sync_parent(path)
}
fn plain_file(path: &Path) -> Result<Value> {
    let info = fs::metadata(path)?;
    if !info.is_file() || info.len() > 20 * 1024 * 1024 {
        return Err(Failure::new(
            "Error",
            "Choose a text screenplay smaller than 20 MB.",
        ));
    }
    let source = fs::read_to_string(path)?;
    if source.contains('\0') {
        return Err(Failure::new(
            "Error",
            "Choose a plain-text UTF-8 Fountain screenplay.",
        ));
    }
    Ok(
        json!({ "source": source, "hash": hash(source.as_bytes()), "name": path.file_name().unwrap_or_default().to_string_lossy() }),
    )
}
fn check_plain_extension(path: &Path) -> Result<()> {
    if !path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("fountain") || s.eq_ignore_ascii_case("txt"))
    {
        return Err(Failure::new(
            "Error",
            "Choose a .fountain or .txt screenplay.",
        ));
    }
    Ok(())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Grant {
    path: PathBuf,
    kind: String,
}
#[derive(Default, Serialize, Deserialize)]
struct Grants {
    grants: BTreeMap<String, Grant>,
}
pub struct NativeFiles {
    root: PathBuf,
    config: Grants,
}
impl NativeFiles {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        let path = root.join("file-grants.json");
        let config = if path.exists() {
            serde_json::from_slice(&fs::read(path)?)?
        } else {
            Grants::default()
        };
        Ok(Self { root, config })
    }
    pub fn grant(&mut self, path: PathBuf, kind: &str) -> Result<Value> {
        let path = fs::canonicalize(path)?;
        if kind == "file" {
            check_plain_extension(&path)?;
        }
        let token = Uuid::new_v4().to_string();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.config.grants.insert(
            token.clone(),
            Grant {
                path,
                kind: kind.into(),
            },
        );
        if let Err(error) = atomic_replace(
            &self.root.join("file-grants.json"),
            &serde_json::to_vec(&self.config)?,
        ) {
            self.config.grants.remove(&token);
            return Err(error);
        }
        Ok(
            json!({ "localHelper": true, "desktop": true, "token": token, "kind": kind, "name": name }),
        )
    }
    fn path_for(&self, handle: &Value) -> Result<PathBuf> {
        let token = text(handle, "token")?;
        let kind = text(handle, "kind")?;
        let grant = self.config.grants.get(token).ok_or_else(|| {
            Failure::new(
                "FilePermissionError",
                "File access is unavailable. Select the file or folder again.",
            )
        })?;
        if fs::canonicalize(
            grant
                .path
                .parent()
                .ok_or_else(|| Failure::new("FilePermissionError", "Invalid file reference."))?,
        )? != grant.path.parent().unwrap()
        {
            return Err(Failure::new(
                "FilePermissionError",
                "The selected path changed. Select it again.",
            ));
        }
        let path = if grant.kind == "file" {
            if kind != "file" {
                return Err(Failure::new(
                    "FilePermissionError",
                    "Invalid file reference.",
                ));
            }
            grant.path.clone()
        } else {
            if fs::canonicalize(&grant.path)? != grant.path {
                return Err(Failure::new(
                    "FilePermissionError",
                    "The selected folder changed. Select it again.",
                ));
            }
            if kind == "directory" {
                return Ok(grant.path.clone());
            }
            let name = text(handle, "name")?;
            if kind != "file"
                || name.contains(['/', '\\', ':'])
                || name.is_empty()
                || Path::new(name).file_name().and_then(|s| s.to_str()) != Some(name)
            {
                return Err(Failure::new(
                    "FilePermissionError",
                    "Invalid screenplay filename.",
                ));
            }
            let path = grant.path.join(name);
            check_plain_extension(&path)?;
            path
        };
        match fs::symlink_metadata(&path) {
            Ok(info) => {
                if info.file_type().is_symlink() || fs::canonicalize(&path)? != path {
                    return Err(Failure::new(
                        "FilePermissionError",
                        "Symbolic links cannot be written. Select the destination directly.",
                    ));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(error.into()),
        }
        Ok(path)
    }
    pub fn run(&mut self, action: &str, body: &Value) -> Result<Value> {
        if action == "status" {
            return Ok(json!({ "available": true, "desktop": true }));
        }
        let handle = body
            .get("handle")
            .ok_or_else(|| Failure::new("FilePermissionError", "A file reference is required."))?;
        let path = self.path_for(handle)?;
        match action {
            "permission" => {
                fs::metadata(if handle["kind"] == "directory" {
                    &path
                } else {
                    path.parent().unwrap()
                })?;
                Ok(json!({ "permission": "granted" }))
            }
            "same-entry" => Ok(json!({ "same": path == self.path_for(&body["other"])? })),
            "read" => plain_file(&path),
            "create" => {
                if handle["kind"] != "directory" {
                    return Err(Failure::new(
                        "FilePermissionError",
                        "Choose a folder first.",
                    ));
                }
                let title: String = text(body, "title")?
                    .chars()
                    .filter(|c| c.is_alphanumeric() || " _-".contains(*c))
                    .take(180)
                    .collect();
                let base = if title.trim().is_empty() {
                    "Untitled Screenplay"
                } else {
                    title.trim()
                };
                let source = text(body, "source")?;
                for number in 0..100 {
                    let name = if number == 0 {
                        format!("{base}.fountain")
                    } else {
                        format!("{base} ({}).fountain", number + 1)
                    };
                    let target = path.join(&name);
                    let file = staged(&target, source.as_bytes())?;
                    match file.persist_noclobber(&target) {
                        Ok(_) => {
                            sync_parent(&target)?;
                            return Ok(
                                json!({ "name": name, "source": source, "hash": hash(source.as_bytes()), "handle": { "localHelper": true, "desktop": true, "kind": "file", "name": name, "token": handle["token"] } }),
                            );
                        }
                        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                            continue
                        }
                        Err(error) => return Err(error.error.into()),
                    }
                }
                Err(Failure::new(
                    "Error",
                    "No unused screenplay filename is available.",
                ))
            }
            "write" | "remove" => {
                let current = plain_file(&path)?;
                let expected = text(body, "expectedHash")?;
                if current["hash"] != expected {
                    return Err(Failure::conflict(current));
                }
                if action == "remove" {
                    fs::remove_file(path)?;
                    return Ok(json!({}));
                }
                let source = text(body, "source")?;
                let pending = staged(&path, source.as_bytes())?;
                pending
                    .as_file()
                    .set_permissions(fs::metadata(&path)?.permissions())?;
                self.path_for(handle)?;
                let latest = plain_file(&path)?;
                if latest["hash"] != expected {
                    return Err(Failure::conflict(latest));
                }
                pending
                    .persist(&path)
                    .map_err(|error| Failure::from(error.error))?;
                sync_parent(&path)?;
                Ok(
                    json!({ "name": path.file_name().unwrap_or_default().to_string_lossy(), "source": source, "hash": hash(source.as_bytes()) }),
                )
            }
            _ => Err(Failure::new("Error", "Unknown native file operation.")),
        }
    }
}
fn safe_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 180
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err(Failure::new("StorageError", "Invalid backup identifier."));
    }
    Ok(())
}
pub struct NativeBackups {
    root: PathBuf,
}
impl NativeBackups {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }
    pub fn run(&self, action: &str, body: &Value) -> Result<Value> {
        match action {
            "list" => {
                let document_id = text(body, "documentId")?;
                safe_id(document_id)?;
                let mut snapshots = vec![];
                for entry in fs::read_dir(&self.root)? {
                    let path = entry?.path();
                    if path.extension().and_then(|s| s.to_str()) != Some("json") {
                        continue;
                    }
                    if fs::symlink_metadata(&path)?.file_type().is_symlink() {
                        return Err(Failure::new(
                            "StorageError",
                            "A backup was replaced by a symbolic link.",
                        ));
                    }
                    let snapshot: Value =
                        serde_json::from_slice(&fs::read(&path)?).map_err(|_| {
                            Failure::new(
                                "StorageError",
                                format!(
                                    "Backup {} could not be read. The file was preserved.",
                                    path.file_name().unwrap_or_default().to_string_lossy()
                                ),
                            )
                        })?;
                    if snapshot["documentId"] == document_id {
                        snapshots.push(snapshot);
                    }
                }
                Ok(json!(snapshots))
            }
            "add" => {
                let snapshot = &body["snapshot"];
                let id = text(snapshot, "id")?;
                safe_id(id)?;
                safe_id(text(snapshot, "documentId")?)?;
                exclusive(
                    &self.root.join(format!("{id}.json")),
                    &serde_json::to_vec(snapshot)?,
                )?;
                Ok(Value::Null)
            }
            "remove" => {
                let ids = body["ids"]
                    .as_array()
                    .ok_or_else(|| Failure::new("StorageError", "Invalid retention request."))?;
                for id in ids {
                    let id = id.as_str().ok_or_else(|| {
                        Failure::new("StorageError", "Invalid backup identifier.")
                    })?;
                    safe_id(id)?;
                    let path = self.root.join(format!("{id}.json"));
                    // Only automatic versions may ever be pruned by this adapter.
                    if path.exists() {
                        let snapshot: Value = serde_json::from_slice(&fs::read(&path)?)?;
                        if snapshot["reason"] != "Automatic Backup" {
                            return Err(Failure::new(
                                "StorageError",
                                "Safety and manual backups cannot be pruned.",
                            ));
                        }
                        let all =
                            self.run("list", &json!({ "documentId": snapshot["documentId"] }))?;
                        if all.as_array().unwrap().len() <= 1 {
                            continue;
                        }
                        fs::remove_file(path)?;
                    }
                }
                Ok(Value::Null)
            }
            _ => Err(Failure::new("StorageError", "Unknown backup operation.")),
        }
    }
}
/// Export destinations are selected separately from autosave and always use an OS save dialog.
pub fn export_file(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Ok(info) = fs::symlink_metadata(path) {
        if info.file_type().is_symlink() {
            return Err(Failure::new(
                "FilePermissionError",
                "Select the actual export destination, not a symbolic link.",
            ));
        }
    }
    let before = fs::read(path).ok().map(|bytes| hash(&bytes));
    let pending = staged(path, bytes)?;
    if let Ok(info) = fs::metadata(path) {
        pending.as_file().set_permissions(info.permissions())?;
    }
    if fs::read(path).ok().map(|bytes| hash(&bytes)) != before {
        return Err(Failure::new(
            "FileConflictError",
            "The export destination changed while saving. Export again.",
        ));
    }
    if before.is_none() {
        pending
            .persist_noclobber(path)
            .map_err(|error| Failure::from(error.error))?;
    } else {
        pending
            .persist(path)
            .map_err(|error| Failure::from(error.error))?;
    }
    sync_parent(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_lifecycle_permissions_conflicts_and_restart() {
        let root = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let mut files = NativeFiles::new(data.path().into()).unwrap();
        let directory = files.grant(root.path().into(), "directory").unwrap();
        let first = files
            .run(
                "create",
                &json!({"handle": directory, "title":"My Film", "source":"FADE IN:\n"}),
            )
            .unwrap();
        let next = files
            .run(
                "create",
                &json!({"handle": directory, "title":"My Film", "source":"Other"}),
            )
            .unwrap();
        assert_eq!(first["name"], "My Film.fountain");
        assert_eq!(next["name"], "My Film (2).fountain");
        let edit = files
            .run(
                "write",
                &json!({"handle":first["handle"],"expectedHash":first["hash"],"source":"Changed"}),
            )
            .unwrap();
        drop(files);
        let mut files = NativeFiles::new(data.path().into()).unwrap();
        assert_eq!(
            files
                .run("read", &json!({"handle":first["handle"]}))
                .unwrap()["source"],
            "Changed"
        );
        fs::write(root.path().join("My Film.fountain"), "Outside edit").unwrap();
        assert_eq!(
            files
                .run(
                    "write",
                    &json!({"handle":first["handle"],"expectedHash":edit["hash"],"source":"Bad"})
                )
                .unwrap_err()
                .name,
            "FileConflictError"
        );
        assert_eq!(
            files
                .run(
                    "remove",
                    &json!({"handle":first["handle"],"expectedHash":edit["hash"]})
                )
                .unwrap_err()
                .name,
            "FileConflictError"
        );
        assert!(files
            .run(
                "read",
                &json!({"handle":{"token":"unknown","kind":"file","name":"x.fountain"}})
            )
            .is_err());
        assert!(files.run("read", &json!({"handle":{"token":directory["token"],"kind":"file","name":"../outside.fountain"}})).is_err());
        fs::remove_file(root.path().join("My Film.fountain")).unwrap();
        assert_eq!(
            files
                .run("read", &json!({"handle":first["handle"]}))
                .unwrap_err()
                .name,
            "NotFoundError"
        );
    }
    #[test]
    fn backups_are_immutable_independent_and_safety_versions_are_retained() {
        let root = tempfile::tempdir().unwrap();
        let store = NativeBackups::new(root.path().into()).unwrap();
        let snapshot = json!({"id":"version-one","documentId":"script-one","reason":"Before Restore","document":{"title":"Original"}});
        store.run("add", &json!({"snapshot":snapshot})).unwrap();
        assert!(store.run("add", &json!({"snapshot":snapshot})).is_err());
        assert!(store
            .run("remove", &json!({"ids":["version-one"]}))
            .is_err());
        drop(store);
        let reopened = NativeBackups::new(root.path().into()).unwrap();
        assert_eq!(
            reopened
                .run("list", &json!({"documentId":"script-one"}))
                .unwrap()[0],
            snapshot
        );
        assert!(reopened
            .run("list", &json!({"documentId":"../outside"}))
            .is_err());
    }
    #[test]
    fn binary_exports_are_real_files_and_only_explicit_exports_replace_destinations() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("test.pdf");
        export_file(&path, b"%PDF-1.4\nproof").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"%PDF-1.4\nproof");
        export_file(&path, b"%PDF-1.4\nupdated").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"%PDF-1.4\nupdated");
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_escape_a_granted_folder() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let target = outside.path().join("protected.fountain");
        fs::write(&target, "Protected").unwrap();
        std::os::unix::fs::symlink(&target, root.path().join("link.fountain")).unwrap();
        let mut files = NativeFiles::new(data.path().into()).unwrap();
        let folder = files.grant(root.path().into(), "directory").unwrap();
        assert!(files
            .run(
                "read",
                &json!({"handle":{"token":folder["token"],"kind":"file","name":"link.fountain"}})
            )
            .is_err());
        assert!(export_file(&root.path().join("link.fountain"), b"Bad").is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "Protected");
    }
    #[test]
    fn corrupted_fountain_reads_reject_without_changing_other_files() {
        let root = tempfile::tempdir().unwrap();
        let good = root.path().join("good.fountain");
        let bad = root.path().join("bad.fountain");
        fs::write(&good, "INT. ROOM - DAY\n\nPreserved.").unwrap();
        fs::write(&bad, [0xff, 0xfe]).unwrap();
        assert!(plain_file(&bad).is_err());
        fs::write(&bad, b"binary\0data").unwrap();
        assert!(plain_file(&bad).is_err());
        assert_eq!(fs::read_to_string(good).unwrap(), "INT. ROOM - DAY\n\nPreserved.");
    }
}

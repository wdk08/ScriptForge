//! All update bytes and endpoints stay native. The frontend never receives an installer path.
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{async_runtime::Mutex, AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates(pub Mutex<Pending>);
#[derive(Default)]
pub struct Pending {
    automatic_checked: bool,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    installed: bool,
}
fn configured(app: &AppHandle) -> bool {
    std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_ROOT").is_none()
        && app.config().plugins.0.get("updater").and_then(|v| v.get("pubkey"))
            .and_then(Value::as_str).is_some_and(|key| !key.trim().is_empty())
}
fn info(pending: &Pending) -> Value {
    pending.update.as_ref().map_or(Value::Null, |update| json!({
        "version":update.version,"currentVersion":update.current_version,
        "notes":update.body,"phase":if pending.installed {"installed"} else if pending.bytes.is_some() {"downloaded"} else {"available"}
    }))
}
#[tauri::command]
pub async fn desktop_app_info(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<Value,String> {
    Ok(json!({"version":app.package_info().version.to_string(),"platform":std::env::consts::OS,
        "updatesConfigured":configured(&app),"update":info(&*state.0.lock().await)}))
}
#[tauri::command]
pub async fn desktop_update_check(app: AppHandle, state: tauri::State<'_, Updates>, automatic: bool) -> Result<Value,String> {
    let mut pending=state.0.lock().await;
    if automatic && pending.automatic_checked {return Ok(json!({"skipped":true}));}
    if automatic {pending.automatic_checked=true;}
    if !configured(&app) {return Err("Updates are not configured in this build. Production signing setup is still required.".into());}
    if pending.update.is_none() {
        let update=app.updater_builder().timeout(std::time::Duration::from_secs(20)).build()
            .map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
        if let Some(update)=&update {
            // The official plugin verifies signatures; additionally forbid plaintext artifacts.
            if update.download_url.scheme()!="https" || update.signature.trim().is_empty() {
                return Err("The release has an insecure download URL or no update signature.".into());
            }
        }
        pending.update=update;
    }
    Ok(json!({"update":info(&pending)}))
}
#[tauri::command]
pub async fn desktop_update_download(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<(),String> {
    let mut pending=state.0.lock().await;
    if pending.bytes.is_some() || pending.installed {return Ok(());}
    let update=pending.update.as_ref().ok_or("Check for an update first.")?;
    let mut downloaded=0u64;
    // download() returns only AFTER the official signature and signed version verify.
    let bytes=update.download(|chunk,total| {
        downloaded=downloaded.saturating_add(chunk as u64);
        let _=app.emit("scriptforge-update-progress",json!({"downloaded":downloaded,"total":total}));
    },||{}).await.map_err(|e|e.to_string())?;
    pending.bytes=Some(bytes);
    Ok(())
}
#[tauri::command]
pub async fn desktop_update_install(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<(),String> {
    let mut pending=state.0.lock().await;
    if pending.installed {return Ok(());}
    let update=pending.update.as_ref().ok_or("No update is ready.")?.clone();
    let bytes=pending.bytes.as_ref().ok_or("Download and verify the update first.")?.clone();
    // Called only after the UI locks editing and verifies recovery + file flush.
    app.state::<super::DesktopState>().closing.store(true,Ordering::SeqCst);
    let result=tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
    app.state::<super::DesktopState>().closing.store(false,Ordering::SeqCst);
    result.map_err(|e|e.to_string())?.map_err(|e|e.to_string())?;
    pending.installed=true;
    pending.bytes=None;
    Ok(())
}
#[tauri::command]
pub async fn desktop_update_restart(app: AppHandle, state: tauri::State<'_, Updates>) -> Result<(),String> {
    if !state.0.lock().await.installed {return Err("No installed update is waiting for a restart.".into());}
    // The frontend repeats its save barrier immediately before this request.
    app.state::<super::DesktopState>().closing.store(true,Ordering::SeqCst);
    app.restart();
}

pub fn menu(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};
    let menu=Menu::default(app)?;
    for item in menu.items()? {
        if let MenuItemKind::Submenu(sub)=item {
            if sub.text()?=="Help" {
                for item in sub.items()? {sub.remove(&item)?;}
                sub.append(&MenuItem::with_id(app,"sf-update","Check for Updates",true,None::<&str>)?)?;
                sub.append(&MenuItem::with_id(app,"sf-about","About ScriptForge",true,None::<&str>)?)?;
            }
            #[cfg(target_os="macos")]
            if sub.text()?==app.package_info().name {
                sub.remove_at(0)?;
                sub.insert(&MenuItem::with_id(app,"sf-app-about","About ScriptForge",true,None::<&str>)?,0)?;
            }
        }
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app,event| {
        let action=match event.id().as_ref() {"sf-update"=>"check","sf-about"|"sf-app-about"=>"about",_=>return};
        let _=app.emit("scriptforge-help",action);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::{io::{Read,Write},net::TcpListener,thread};
    // Public throwaway signature vector from tauri-plugin-updater 2.14.0 offline_tests.
    // No private key is used or embedded. Payload: `test`, signed version: 2.0.0.
    const KEY:&str="untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
    const SIG:&str="untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";
    fn app() -> tauri::App<tauri::test::MockRuntime> {
        let mut context=tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert("updater".into(),json!({"pubkey":STANDARD.encode(KEY),"endpoints":["https://example.invalid/update"],"requireSignedVersion":true,"dangerousInsecureTransportProtocol":true}));
        tauri::test::mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(context).unwrap()
    }
    fn metadata(url:&str)->Value {json!({"version":"2.0.0","notes":"Test release notes","pub_date":"2026-10-19T00:00:00Z","platforms":{"test-target":{"url":url,"signature":STANDARD.encode(SIG)}}})}
    #[test]
    fn official_plugin_checks_signed_payload_version_and_rejects_tampering() {
        let app=app();let updater=app.updater_builder().target("test-target").build().unwrap();
        let update=updater.restore_update(metadata("https://example.invalid/payload")).unwrap().unwrap();
        update.verify(b"test").unwrap();assert!(update.verify(b"tampered").is_err());
        let mut mismatched=metadata("https://example.invalid/payload");mismatched["version"]=json!("3.0.0");assert!(updater.restore_update(mismatched).unwrap().unwrap().verify(b"test").is_err());
        let mut missing=metadata("https://example.invalid/payload");missing["platforms"]["test-target"]["signature"]=json!("");assert!(updater.restore_update(missing).unwrap().unwrap().verify(b"test").is_err());
        assert!(updater.restore_update(json!({"version":"bad"})).is_err());
        let mut older=metadata("https://example.invalid/payload");older["version"]=json!("0.0.0");assert!(updater.restore_update(older).unwrap().is_none());
    }
    #[test]
    fn official_check_download_progress_and_signature_verification_over_test_transport() {
        for payload in [b"test".as_slice(),b"tampered".as_slice()] {
            let listener=TcpListener::bind("127.0.0.1:0").unwrap();let base=format!("http://{}",listener.local_addr().unwrap());
            let manifest=metadata(&format!("{base}/payload")).to_string().into_bytes();let data=payload.to_vec();
            let server=thread::spawn(move||{for body in [manifest,data] {let(mut socket,_)=listener.accept().unwrap();let mut request=[0;8192];let _=socket.read(&mut request);write!(socket,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len()).unwrap();socket.write_all(&body).unwrap();}});
            let app=app();let updater=app.updater_builder().target("test-target").timeout(std::time::Duration::from_secs(3)).no_proxy().endpoints(vec![format!("{base}/latest").parse().unwrap()]).unwrap().build().unwrap();
            tauri::async_runtime::block_on(async {let update=updater.check().await.unwrap().unwrap();assert_eq!(update.body.as_deref(),Some("Test release notes"));let mut downloaded=0;let bytes=update.download(|chunk,total|{downloaded+=chunk;assert_eq!(total,Some(payload.len() as u64));},||{}).await;if payload==b"test"{assert_eq!(bytes.unwrap(),b"test");}else{assert!(bytes.is_err());}assert_eq!(downloaded,payload.len());});server.join().unwrap();
        }
    }
}

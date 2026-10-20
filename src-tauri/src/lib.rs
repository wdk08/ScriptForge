mod storage;
mod updates;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use storage::{Failure, NativeBackups, NativeFiles};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
struct Smoke {
    root: PathBuf,
    directory: Value,
    started: AtomicBool,
}
struct DesktopState {
    smoke: Option<Smoke>,
    closing: AtomicBool,
    files: Mutex<NativeFiles>,
    backups: Mutex<NativeBackups>,
}
fn locked() -> Failure {
    Failure::new(
        "StorageError",
        "Native storage is temporarily unavailable. Your editor content is preserved.",
    )
}

#[tauri::command]
async fn desktop_local(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
    action: String,
    body: Value,
) -> storage::Result<Value> {
    match action.as_str() {
        "choose-folder" => {
            let mut dialog = app
                .dialog()
                .file()
                .set_title("Choose Screenplay Folder — recommended: Documents/ScriptForge");
            if let Some(window) = app.get_webview_window("main") {
                dialog = dialog.set_parent(&window);
            }
            if let Ok(documents) = app.path().document_dir() {
                dialog = dialog.set_directory(documents);
            }
            let path = dialog
                .blocking_pick_folder()
                .ok_or_else(|| Failure::new("AbortError", "Folder selection cancelled."))?
                .into_path()
                .map_err(|error| Failure::new("FilePermissionError", error.to_string()))?;
            state
                .files
                .lock()
                .map_err(|_| locked())?
                .grant(path, "directory")
        }
        "open-file" => {
            let mut dialog = app
                .dialog()
                .file()
                .set_title("Open Fountain screenplay")
                .add_filter("Fountain screenplay", &["fountain", "txt"]);
            if let Some(window) = app.get_webview_window("main") {
                dialog = dialog.set_parent(&window);
            }
            let path = dialog
                .blocking_pick_file()
                .ok_or_else(|| Failure::new("AbortError", "File selection cancelled."))?
                .into_path()
                .map_err(|error| Failure::new("FilePermissionError", error.to_string()))?;
            let mut files = state.files.lock().map_err(|_| locked())?;
            let handle = files.grant(path, "file")?;
            let mut result = files.run("read", &json!({"handle":handle}))?;
            result["handle"] = handle;
            Ok(result)
        }
        _ => state
            .files
            .lock()
            .map_err(|_| locked())?
            .run(&action, &body),
    }
}
#[tauri::command]
async fn desktop_backups(
    state: tauri::State<'_, DesktopState>,
    action: String,
    body: Value,
) -> storage::Result<Value> {
    state
        .backups
        .lock()
        .map_err(|_| locked())?
        .run(&action, &body)
}
#[tauri::command]
async fn desktop_export(
    app: tauri::AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> storage::Result<Value> {
    if name.contains(['/', '\\'])
        || !(name.to_lowercase().ends_with(".pdf") || name.to_lowercase().ends_with(".fountain"))
    {
        return Err(Failure::new("Error", "Invalid export filename."));
    }
    let extension = if name.to_lowercase().ends_with(".pdf") {
        "pdf"
    } else {
        "fountain"
    };
    let mut dialog = app
        .dialog()
        .file()
        .set_title("Export screenplay copy")
        .set_file_name(&name)
        .add_filter("Screenplay export", &[extension]);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    if let Ok(documents) = app.path().document_dir() {
        dialog = dialog.set_directory(documents);
    }
    let path = dialog
        .blocking_save_file()
        .ok_or_else(|| Failure::new("AbortError", "Export cancelled."))?
        .into_path()
        .map_err(|error| Failure::new("FilePermissionError", error.to_string()))?;
    storage::export_file(&path, &bytes)?;
    Ok(json!({"kind":"export","name":path.file_name().unwrap_or_default().to_string_lossy()}))
}
#[tauri::command]
fn desktop_close(app: tauri::AppHandle, state: tauri::State<'_, DesktopState>) {
    state.closing.store(true, Ordering::SeqCst);
    app.exit(0);
}
// Diagnostic IPC is disabled in ordinary launches and can only touch an explicitly
// supplied temporary test directory. No user library is edited by the smoke test.
#[tauri::command]
fn desktop_diagnostics(app: tauri::AppHandle, state: tauri::State<'_, DesktopState>) -> storage::Result<Value> {
    let smoke = state
        .smoke
        .as_ref()
        .ok_or_else(|| Failure::new("Error", "Diagnostics are disabled."))?;
    let mut help_items = Vec::new();
    if let Some(menu) = app.menu() {
        for item in menu.items().unwrap_or_default() {
            if let tauri::menu::MenuItemKind::Submenu(sub) = item {
                if sub.text().ok().as_deref() == Some("Help") {
                    for item in sub.items().unwrap_or_default() {
                        if let tauri::menu::MenuItemKind::MenuItem(item) = item {
                            if let Ok(text) = item.text() { help_items.push(text); }
                        }
                    }
                }
            }
        }
    }
    let config = std::fs::read(smoke.root.join("model.onnx.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    let previous = std::fs::read(smoke.root.join("first-report.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    Ok(
        json!({"helpItems":help_items,"manualKeyboard":smoke.root.join("manual-shortcuts").exists(),"directory":smoke.directory,"config":config,"layoutSource":std::fs::read_to_string(smoke.root.join("layout.fountain")).ok(),"restart":std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_RESTART").is_some(),"previous":previous}),
    )
}
#[tauri::command]
fn desktop_diagnostics_model(
    state: tauri::State<'_, DesktopState>,
) -> storage::Result<tauri::ipc::Response> {
    let smoke = state
        .smoke
        .as_ref()
        .ok_or_else(|| Failure::new("Error", "Diagnostics are disabled."))?;
    Ok(tauri::ipc::Response::new(std::fs::read(
        smoke.root.join("model.onnx"),
    )?))
}
#[tauri::command]
fn desktop_diagnostics_pdf(
    state: tauri::State<'_, DesktopState>,
    bytes: Vec<u8>,
) -> storage::Result<()> {
    let smoke = state
        .smoke
        .as_ref()
        .ok_or_else(|| Failure::new("Error", "Diagnostics are disabled."))?;
    std::fs::write(smoke.root.join("layout-proof.pdf"), bytes)?;
    Ok(())
}
#[tauri::command]
fn desktop_diagnostics_report(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
    report: Value,
) -> storage::Result<()> {
    let smoke = state
        .smoke
        .as_ref()
        .ok_or_else(|| Failure::new("Error", "Diagnostics are disabled."))?;
    let name = if std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_RESTART").is_some() {
        "restart-report.json"
    } else {
        "first-report.json"
    };
    std::fs::write(smoke.root.join(name), serde_json::to_vec_pretty(&report)?)?;
    state.closing.store(true, Ordering::SeqCst);
    app.exit(if report["success"] == true { 0 } else { 1 });
    Ok(())
}
pub fn run() {
    let stress = std::env::var_os("SCRIPTFORGE_IMPORT_STRESS").is_some()
        && std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_ROOT").is_some();
    let mut builder = tauri::Builder::default();
    if stress {
        let database = format!("scriptforge-stress-{}-", std::process::id());
        let script = format!("window.scriptForgeDiagnosticDatabasePrefix = {};", serde_json::to_string(&database).unwrap());
        builder = builder.plugin(tauri::plugin::Builder::<tauri::Wry>::new("import-diagnostics").js_init_script(script).build());
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Updates::default())
        .setup(|app| {
            let smoke_root = std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_ROOT").map(PathBuf::from);
            if let Some(root) = &smoke_root {
                if !root.is_dir()
                    || !root.file_name().is_some_and(|name| {
                        name.to_string_lossy()
                            .starts_with("scriptforge-desktop-smoke-")
                    })
                {
                    return Err(
                        "Native diagnostics require an isolated temporary smoke directory.".into(),
                    );
                }
            }
            let root = if let Some(root) = &smoke_root {
                root.join("appdata")
            } else {
                app.path().app_data_dir()?
            };
            let mut files = NativeFiles::new(root.clone()).map_err(|error| error.message)?;
            let smoke = if let Some(root) = smoke_root {
                std::fs::create_dir_all(root.join("scripts"))?;
                let directory = files
                    .grant(root.join("scripts"), "directory")
                    .map_err(|error| error.message)?;
                Some(Smoke {
                    root,
                    directory,
                    started: AtomicBool::new(false),
                })
            } else {
                None
            };
            let backups =
                NativeBackups::new(root.join("backups")).map_err(|error| error.message)?;
            app.manage(DesktopState {
                smoke,
                closing: AtomicBool::new(false),
                files: Mutex::new(files),
                backups: Mutex::new(backups),
            });
            updates::menu(app.handle())?;
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                if let Some(state) = webview.try_state::<DesktopState>() {
                    if let Some(smoke) = &state.smoke {
                        if std::env::var_os("SCRIPTFORGE_IMPORT_STRESS").is_some() {
                            let _ = webview.set_focus();
                            let script = std::fs::read_to_string(smoke.root.join("stress.js"))
                                .unwrap_or_else(|_| include_str!("../../scripts/desktop-import-stress.js").into());
                            let _ = webview.eval(script);
                        } else if !smoke.started.swap(true, Ordering::SeqCst) {
                            let _ = webview.eval(include_str!("../../scripts/desktop-smoke.js"));
                        }
                    }
                }
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !window
                    .state::<DesktopState>()
                    .closing
                    .load(Ordering::SeqCst)
                {
                    api.prevent_close();
                    let _ = window.emit("scriptforge-close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            updates::desktop_app_info,
            updates::desktop_update_check,
            updates::desktop_update_download,
            updates::desktop_update_install,
            updates::desktop_update_restart,
            desktop_local,
            desktop_backups,
            desktop_export,
            desktop_close,
            desktop_diagnostics,
            desktop_diagnostics_model,
            desktop_diagnostics_pdf,
            desktop_diagnostics_report
        ])
        .build(tauri::generate_context!())
        .expect("ScriptForge could not start")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if !app.state::<DesktopState>().closing.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("scriptforge-close-requested", ());
                }
            }
        });
}

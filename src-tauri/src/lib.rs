mod managed_library;
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
    library: managed_library::ManagedLibrary,
}
fn locked() -> Failure {
    Failure::new(
        "StorageError",
        "Native storage is temporarily unavailable. Your editor content is preserved.",
    )
}

fn is_dev_app(app: &tauri::AppHandle) -> bool {
    tauri::is_dev() && app.config().identifier == "com.scriptforge.dev"
}
fn dev_screenplays(app: &tauri::AppHandle) -> storage::Result<PathBuf> {
    let root = app.path().app_data_dir().map_err(|e| Failure::new("StorageError",e.to_string()))?.join("sandbox/screenplays");
    if root.is_symlink() || root.parent().is_some_and(|parent| parent.is_symlink()) {
        return Err(Failure::new("StorageError", "The Dev sandbox cannot be redirected."));
    }
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

#[tauri::command]
async fn desktop_local(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
    action: String,
    body: Value,
) -> storage::Result<Value> {
    match action.as_str() {
        "library-get" | "library-list" | "library-put" => state.library.run(&action, &body),
        "choose-folder" => {
            if is_dev_app(&app) {
                return state.files.lock().map_err(|_| locked())?.grant(dev_screenplays(&app)?, "directory");
            }
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
        "open-file" | "import-file" => {
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
            if action == "import-file" { return storage::plain_file(&path); }
            let mut files = state.files.lock().map_err(|_| locked())?;
            if is_dev_app(&app) { return files.import_copy(&path); }
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
    if is_dev_app(&app) {
        let root = app.path().app_data_dir().map_err(|e| Failure::new("StorageError",e.to_string()))?.join("sandbox/exports");
        if root.is_symlink() || root.parent().is_some_and(|parent| parent.is_symlink()) {
            return Err(Failure::new("StorageError", "The Dev export directory cannot be redirected."));
        }
        std::fs::create_dir_all(&root)?;
        let path = root.join(format!("{}-{}", uuid::Uuid::new_v4(),name));
        storage::export_dev_copy(&path, &bytes)?;
        return Ok(json!({"kind":"export","name":path.file_name().unwrap_or_default().to_string_lossy()}));
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
    if is_dev_app(&app) && std::env::var("SCRIPTFORGE_DEV_CHECK").as_deref() == Ok("1") {
        eprintln!("SCRIPTFORGE_DEV_CHECK: {}",report);
        state.closing.store(true, Ordering::SeqCst);
        app.exit(if report["success"] == true {0} else {1});
        return Ok(());
    }
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
            if tauri::is_dev() && app.config().identifier != "com.scriptforge.dev" && std::env::var_os("SCRIPTFORGE_DESKTOP_SMOKE_ROOT").is_none() {
                return Err("Use npm run desktop:dev: interactive development requires the isolated ScriptForge Dev identity.".into());
            }
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
            if is_dev_app(app.handle()) && (root.is_symlink()
                || root.join("file-grants.json").is_symlink() || root.join("backups").is_symlink()) {
                return Err("Dev application data must not be redirected to another application's storage.".into());
            }
            let mut files = NativeFiles::new(root.clone()).map_err(|error| error.message)?;
            if is_dev_app(app.handle()) { files.restrict_to(dev_screenplays(app.handle()).map_err(|e| e.message)?) .map_err(|e| e.message)?; }
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
            let library = managed_library::ManagedLibrary::new(&root, is_dev_app(app.handle())).map_err(|error| error.message)?;
            app.manage(DesktopState {
                smoke,
                closing: AtomicBool::new(false),
                files: Mutex::new(files),
                backups: Mutex::new(backups),
                library,
            });
            updates::menu(app.handle())?;
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                if is_dev_app(webview.app_handle()) && std::env::var("SCRIPTFORGE_DEV_CHECK").as_deref() == Ok("1") {
                    let script = include_str!("../../scripts/dev-check.js");
                    let _ = webview.eval(script);
                }
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
        .build({
            let mut context = tauri::generate_context!();
            if tauri::is_dev() && context.config().identifier == "com.scriptforge.dev" {
                // Configure in Rust: this Tauri version emits a Vec instead of an array
                // when dataStoreIdentifier is supplied through JSON code generation.
                context.config_mut().app.windows[0].data_store_identifier = Some([83,70,68,101,118,17,65,50,139,17,17,0,0,0,0,1]);
            }
            context
        })
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

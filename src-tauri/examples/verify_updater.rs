//! CI-only artifact verification through the official plugin. Never downloads or installs.
use serde_json::{json,Value};
use std::{fs,path::Path};
use tauri_plugin_updater::UpdaterExt;
fn signatures(root:&Path,out:&mut Vec<std::path::PathBuf>)->std::io::Result<()> {
 for entry in fs::read_dir(root)? {let path=entry?.path();if path.is_dir(){signatures(&path,out)?;}else if path.extension().is_some_and(|s|s=="sig"){out.push(path);}}Ok(())
}
fn main()->Result<(),Box<dyn std::error::Error>> {
 let args:Vec<_>=std::env::args().collect();if args.len()!=3{return Err("Usage: verify_updater <tauri.conf.json> <bundle directory>".into());}
 let config:Value=serde_json::from_slice(&fs::read(&args[1])?)?;
 let mut context=tauri::test::mock_context(tauri::test::noop_assets());
 context.config_mut().plugins.0.insert("updater".into(),config["plugins"]["updater"].clone());
 let app=tauri::test::mock_builder().plugin(tauri_plugin_updater::Builder::new().build()).build(context)?;
 // This verifier checks the package being built, not whether it is newer than the verifier.
 // The SHIPPING updater keeps its default newer-only comparator.
 let updater=app.updater_builder().target("verification").version_comparator(|_,_|true).build()?;
 let mut paths=Vec::new();signatures(Path::new(&args[2]),&mut paths)?;if paths.is_empty(){return Err("No updater signatures were generated.".into());}
 for path in paths {
  let artifact=path.with_extension("");
  let metadata=json!({"version":config["version"],"notes":"CI signature verification","platforms":{"verification":{"url":"https://example.invalid/not-downloaded","signature":fs::read_to_string(&path)?}}});
  updater.restore_update(metadata)?.ok_or("Missing verification metadata")?.verify(&fs::read(&artifact)?)?;
  println!("Verified update bytes, embedded public key and signed version: {}",artifact.file_name().unwrap().to_string_lossy());
 }
 Ok(())
}

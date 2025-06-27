use std::{
    path::{Path, PathBuf},
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
    process::{Child, Command, Stdio},
    io::{self, Write, BufReader, BufRead},
    fs::{self, File, OpenOptions},
};
use reqwest::{Client, Url, header};
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use tokio::{task, time, fs as tokio_fs, io::AsyncWriteExt};
use async_trait::async_trait;
use tempfile::tempdir;
use zip_extract;
use toml;

// Constants
const SALT_LENGTH: usize = 16;
const HASH_ITERATIONS: u32 = 100_000;
const HASH_KEYLEN: usize = 64;
const HASH_DIGEST: &str = "sha512";
const USER_AGENT: &str = "VelocityManager/1.0 (contact@example.com)";

// Configuration structures
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Server {
    id: String,
    name: String,
    port: u16,
    status: String,
    description: String,
    ip: String,
    min_ram: String,
    max_ram: String,
    connected_players: Vec<String>,
    cpu_usage: f32,
    ram_usage: u8,
    current_ram: u32,
    tags: Vec<String>,
    pid: Option<u32>,
    jar_file_name: Option<String>,
    server_version: Option<String>,
    software_type: Option<String>,
    logo_url: Option<String>,
    console_log_file: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct User {
    username: String,
    password: String,
    roles: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Role {
    permissions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Config {
    available_permissions: Vec<String>,
    roles: HashMap<String, Role>,
    users: Vec<User>,
    stats_poll_interval_ms: u64,
}

// Main controller struct
pub struct IndexController {
    config: Config,
    active_server_processes: Arc<Mutex<HashMap<String, Child>>>,
    active_log_file_streams: Arc<Mutex<HashMap<String, File>>>,
    stdout_buffers: Arc<Mutex<HashMap<String, Vec<String>>>>,
    app_data_root: PathBuf,
    servers_file_path: PathBuf,
    proxies_file_path: PathBuf,
    config_file_path: PathBuf,
    main_servers_dir: PathBuf,
    recovery_dir: PathBuf,
    backups_dir: PathBuf,
    templates_dir: PathBuf,
    http_client: Client,
}

impl IndexController {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Determine app data root
        let app_data_root = if cfg!(windows) {
            PathBuf::from(std::env::var("APPDATA")?)
        } else {
            PathBuf::from("/var/lib/velocity_manager")
        };

        // Create necessary directories
        fs::create_dir_all(&app_data_root)?;
        let main_servers_dir = app_data_root.join("servers");
        fs::create_dir_all(&main_servers_dir)?;
        let recovery_dir = app_data_root.join("recovery");
        fs::create_dir_all(&recovery_dir)?;
        let backups_dir = app_data_root.join("backups");
        fs::create_dir_all(&backups_dir)?;

        // Initialize file paths
        let servers_file_path = app_data_root.join("servers.json");
        if !servers_file_path.exists() {
            fs::write(&servers_file_path, "[]")?;
        }

        let proxies_file_path = app_data_root.join("proxies.json");
        if !proxies_file_path.exists() {
            fs::write(&proxies_file_path, "[]")?;
        }

        let config_file_path = app_data_root.join("config.json");
        let config = if config_file_path.exists() {
            let config_data = fs::read_to_string(&config_file_path)?;
            serde_json::from_str(&config_data)?
        } else {
            let default_config = Config {
                available_permissions: vec![
                    "view_server_stats".to_string(),
                    "view_logs".to_string(),
                    "edit_configs".to_string(),
                    "start_stop_servers".to_string(),
                    "create_servers".to_string(),
                    "create_users".to_string(),
                    "assign_roles".to_string(),
                    "manage_roles".to_string(),
                    "manage_recovery".to_string(),
                    "manage_backups".to_string(),
                    "send_console_commands".to_string(),
                    "delete_server".to_string(),
                    "install_plugins".to_string(),
                ],
                roles: HashMap::from([
                    ("Admin".to_string(), Role {
                        permissions: vec![
                            "view_server_stats".to_string(),
                            "view_logs".to_string(),
                            "edit_configs".to_string(),
                            "start_stop_servers".to_string(),
                            "create_servers".to_string(),
                            "create_users".to_string(),
                            "assign_roles".to_string(),
                            "manage_roles".to_string(),
                            "manage_recovery".to_string(),
                            "manage_backups".to_string(),
                            "send_console_commands".to_string(),
                            "delete_server".to_string(),
                            "install_plugins".to_string(),
                        ],
                    }),
                    ("Editor".to_string(), Role {
                        permissions: vec![
                            "view_server_stats".to_string(),
                            "view_logs".to_string(),
                            "edit_configs".to_string(),
                            "start_stop_servers".to_string(),
                            "create_servers".to_string(),
                            "manage_backups".to_string(),
                            "send_console_commands".to_string(),
                            "delete_server".to_string(),
                            "install_plugins".to_string(),
                        ],
                    }),
                    ("Viewer".to_string(), Role {
                        permissions: vec![
                            "view_server_stats".to_string(),
                            "view_logs".to_string(),
                        ],
                    }),
                ]),
                users: vec![User {
                    username: "admin".to_string(),
                    password: Self::hash_password("password", None)?,
                    roles: vec!["Admin".to_string()],
                }],
                stats_poll_interval_ms: 2500,
            };
            fs::write(&config_file_path, serde_json::to_string_pretty(&default_config)?)?;
            default_config
        };

        let templates_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("templates");

        let http_client = Client::builder()
            .user_agent(USER_AGENT)
            .build()?;

        let controller = Self {
            config,
            active_server_processes: Arc::new(Mutex::new(HashMap::new())),
            active_log_file_streams: Arc::new(Mutex::new(HashMap::new())),
            stdout_buffers: Arc::new(Mutex::new(HashMap::new())),
            app_data_root,
            servers_file_path,
            proxies_file_path,
            config_file_path,
            main_servers_dir,
            recovery_dir,
            backups_dir,
            templates_dir,
            http_client,
        };

        controller.initialize_server_states()?;
        controller.start_stats_monitoring();

        Ok(controller)
    }

    fn hash_password(password: &str, salt_provided: Option<&str>) -> Result<String, Box<dyn std::error::Error>> {
        let salt = salt_provided.map(String::from).unwrap_or_else(|| {
            let mut salt = vec![0u8; SALT_LENGTH];
            getrandom::getrandom(&mut salt).unwrap();
            hex::encode(salt)
        });
        
        let mut output = vec![0u8; HASH_KEYLEN];
        pbkdf2::pbkdf2::<hmac::Hmac<sha2::Sha512>>(
            password.as_bytes(),
            salt.as_bytes(),
            HASH_ITERATIONS,
            &mut output
        )?;
        
        Ok(format!("{}${}", salt, hex::encode(output)))
    }

    fn sanitize(name: &str) -> String {
        name.chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' { c } else { '_' })
            .collect()
    }

    fn get_server_folder_path(&self, server: &Server) -> PathBuf {
        let folder_name = format!("{}-{}", Self::sanitize(&server.name), server.id);
        self.main_servers_dir.join(folder_name)
    }

    fn get_backup_folder_path(&self, server: &Server) -> PathBuf {
        self.backups_dir.join(&server.id)
    }

    fn read_servers(&self) -> Result<Vec<Server>, Box<dyn std::error::Error>> {
        let data = fs::read_to_string(&self.servers_file_path)?;
        Ok(serde_json::from_str(&data)?)
    }

    fn write_servers(&self, servers: &[Server]) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::to_string_pretty(servers)?;
        fs::write(&self.servers_file_path, data)?;
        Ok(())
    }

    fn read_proxies(&self) -> Result<Vec<Server>, Box<dyn std::error::Error>> {
        let data = fs::read_to_string(&self.proxies_file_path)?;
        Ok(serde_json::from_str(&data)?)
    }

    fn write_proxies(&self, proxies: &[Server]) -> Result<(), Box<dyn std::error::Error>> {
        let data = serde_json::to_string_pretty(proxies)?;
        fs::write(&self.proxies_file_path, data)?;
        Ok(())
    }

    fn parse_ram_to_bytes(&self, ram_string: &str) -> u64 {
        let upper = ram_string.to_uppercase();
        let value = match upper.trim_end_matches(|c: char| !c.is_numeric()).parse::<u64>() {
            Ok(v) => v,
            Err(_) => return 0,
        };

        if upper.ends_with('G') {
            value * 1024 * 1024 * 1024
        } else if upper.ends_with('M') {
            value * 1024 * 1024
        } else {
            value
        }
    }

    fn initialize_server_states(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut servers = self.read_servers()?;
        let mut changes_made = false;

        for server in &mut servers {
            if let Some(pid) = server.pid {
                if server.status == "Online" || server.status == "Starting" || server.status == "restarting" {
                    if let Err(_) = nix::sys::signal::kill(
                        nix::unistd::Pid::from_raw(pid as i32),
                        nix::sys::signal::Signal::SIGCONT
                    ) {
                        server.status = "Offline".to_string();
                        server.pid = None;
                        server.connected_players.clear();
                        changes_made = true;
                        self.cleanup_server_process(&server.id);
                    }
                } else if server.status == "Offline" {
                    server.pid = None;
                    changes_made = true;
                }
            }

            if server.tags.is_empty() {
                server.tags = Vec::new();
                changes_made = true;
            }
        }

        if changes_made {
            self.write_servers(&servers)?;
        }

        Ok(())
    }

    fn cleanup_server_process(&self, server_id: &str) {
        let mut log_streams = self.active_log_file_streams.lock().unwrap();
        if let Some(stream) = log_streams.remove(server_id) {
            drop(stream); // Close the file
        }

        let mut buffers = self.stdout_buffers.lock().unwrap();
        buffers.remove(server_id);

        let mut processes = self.active_server_processes.lock().unwrap();
        if let Some(mut process) = processes.remove(server_id) {
            let _ = process.kill();
        }
    }

    fn start_stats_monitoring(&self) {
        let interval = Duration::from_millis(self.config.stats_poll_interval_ms);
        let controller = Arc::new(self.clone());
        
        tokio::spawn(async move {
            let mut interval = time::interval(interval);
            loop {
                interval.tick().await;
                if let Err(e) = controller.update_all_server_stats().await {
                    eprintln!("Error updating server stats: {}", e);
                }
            }
        });
    }

    async fn update_all_server_stats(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut servers = self.read_servers()?;
        if servers.is_empty() {
            return Ok(());
        }

        let mut has_changes = false;

        for server in &mut servers {
            if server.status == "Online" && server.pid.is_some() {
                let pid = server.pid.unwrap();
                if let Ok(stats) = sysinfo::Process::new(pid) {
                    let max_ram_bytes = self.parse_ram_to_bytes(&server.max_ram);
                    let new_cpu = (stats.cpu_usage() * 10.0).round() / 10.0; // Round to 1 decimal place
                    let new_current_ram = stats.memory() / (1024 * 1024); // Convert to MB
                    let new_ram_usage = if max_ram_bytes > 0 {
                        ((stats.memory() as f64 / max_ram_bytes as f64) * 100.0).round() as u8
                    } else {
                        0
                    };

                    if (server.cpu_usage - new_cpu).abs() > f32::EPSILON 
                        || server.ram_usage != new_ram_usage 
                        || server.current_ram != new_current_ram as u32 {
                        server.cpu_usage = new_cpu;
                        server.ram_usage = new_ram_usage.min(100);
                        server.current_ram = new_current_ram as u32;
                        has_changes = true;
                    }
                } else {
                    self.cleanup_server_process(&server.id);
                    server.status = "Error".to_string();
                    server.pid = None;
                    server.cpu_usage = 0.0;
                    server.ram_usage = 0;
                    server.current_ram = 0;
                    has_changes = true;
                }
            } else if server.cpu_usage != 0.0 || server.ram_usage != 0 || server.current_ram != 0 {
                server.cpu_usage = 0.0;
                server.ram_usage = 0;
                server.current_ram = 0;
                has_changes = true;
            }
        }

        if has_changes {
            self.write_servers(&servers)?;
        }

        Ok(())
    }

    async fn download_file(&self, url: &str, target_dir: &Path, target_filename: Option<&str>) -> Result<PathBuf, Box<dyn std::error::Error>> {
        let response = self.http_client.get(url).send().await?;
        
        if response.status().is_redirection() {
            if let Some(location) = response.headers().get(header::LOCATION) {
                let location = location.to_str()?;
                return self.download_file(location, target_dir, target_filename).await;
            }
        }

        if !response.status().is_success() {
            return Err(format!("Failed to download file: {}", response.status()).into());
        }

        let final_filename = match target_filename {
            Some(name) => name.to_string(),
            None => {
                if let Some(content_disposition) = response.headers().get(header::CONTENT_DISPOSITION) {
                    if let Ok(disposition) = content_disposition.to_str() {
                        if let Some(captures) = regex::Regex::new(r#"filename="([^"]+)""#)
                            .unwrap()
                            .captures(disposition) {
                            captures[1].to_string()
                        } else {
                            Url::parse(url)?
                                .path_segments()
                                .and_then(|segments| segments.last())
                                .unwrap_or("unknown")
                                .to_string()
                        }
                    } else {
                        Url::parse(url)?
                            .path_segments()
                            .and_then(|segments| segments.last())
                            .unwrap_or("unknown")
                            .to_string()
                    }
                } else {
                    Url::parse(url)?
                        .path_segments()
                        .and_then(|segments| segments.last())
                        .unwrap_or("unknown")
                        .to_string()
                }
            }
        };

        let file_path = target_dir.join(final_filename);
        tokio::fs::create_dir_all(target_dir).await?;
        let mut file = tokio::fs::File::create(&file_path).await?;
        let mut content = response.bytes().await?;
        file.write_all(&content).await?;

        Ok(file_path)
    }

    async fn https_get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, Box<dyn std::error::Error>> {
        let response = self.http_client.get(url).send().await?;
        
        if response.status().is_redirection() {
            if let Some(location) = response.headers().get(header::LOCATION) {
                let location = location.to_str()?;
                return self.https_get_json(location).await;
            }
        }

        if !response.status().is_success() {
            return Err(format!("Request Failed. Status Code: {}", response.status()).into());
        }

        let json = response.json::<T>().await?;
        Ok(json)
    }

    pub async fn create_from_modpack(&self, body: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        let server_name = body["serverName"].as_str().ok_or("Missing serverName")?;
        let port = body["port"].as_u64().ok_or("Missing port")? as u16;
        let min_ram = body["minRam"].as_str().ok_or("Missing minRam")?;
        let max_ram = body["maxRam"].as_str().ok_or("Missing maxRam")?;
        let modpack_version_id = body["modpackVersionId"].as_str().ok_or("Missing modpackVersionId")?;
        let description = body["description"].as_str().unwrap_or("");

        let new_server_id = Uuid::new_v4().to_string();
        let temp_extract_dir = tempdir()?;

        let server_path = self.get_server_folder_path(&Server {
            id: new_server_id.clone(),
            name: server_name.to_string(),
            port,
            status: "Starting".to_string(),
            description: "Creating from Modrinth pack...".to_string(),
            ip: "127.0.0.1".to_string(),
            min_ram: min_ram.to_string(),
            max_ram: max_ram.to_string(),
            connected_players: Vec::new(),
            cpu_usage: 0.0,
            ram_usage: 0,
            current_ram: 0,
            tags: Vec::new(),
            pid: None,
            jar_file_name: None,
            server_version: None,
            software_type: None,
            logo_url: None,
            console_log_file: None,
        });

        let placeholder_server = Server {
            id: new_server_id.clone(),
            name: server_name.to_string(),
            port,
            status: "Starting".to_string(),
            description: "Creating from Modrinth pack...".to_string(),
            ip: "127.0.0.1".to_string(),
            min_ram: min_ram.to_string(),
            max_ram: max_ram.to_string(),
            connected_players: Vec::new(),
            cpu_usage: 0.0,
            ram_usage: 0,
            current_ram: 0,
            tags: Vec::new(),
            pid: None,
            jar_file_name: None,
            server_version: None,
            software_type: None,
            logo_url: None,
            console_log_file: None,
        };

        // Check for existing servers with same name/port
        let servers = self.read_servers()?;
        if servers.iter().any(|s| s.name.to_lowercase() == server_name.to_lowercase()) 
            || servers.iter().any(|s| s.port == port) {
            return Err(format!("A server with name '{}' or port {} already exists", server_name, port).into());
        }

        // Add placeholder server
        let mut updated_servers = servers.clone();
        updated_servers.push(placeholder_server);
        self.write_servers(&updated_servers)?;

        // Fetch version details
        let version_details: serde_json::Value = self.https_get_json(
            &format!("https://api.modrinth.com/v2/version/{}", modpack_version_id)
        ).await?;

        let server_file = version_details["files"].as_array()
            .ok_or("No files in version")?
            .iter()
            .find(|f| f["primary"].as_bool().unwrap_or(false) 
                && f["filename"].as_str().unwrap_or("").ends_with(".mrpack"))
            .ok_or("Could not find a primary server pack (.mrpack) in this version")?;

        tokio::fs::create_dir_all(&server_path).await?;
        let mrpack_path = self.download_file(
            server_file["url"].as_str().ok_or("Missing file URL")?,
            temp_extract_dir.path(),
            Some(server_file["filename"].as_str().ok_or("Missing filename")?)
        ).await?;

        // Extract the modpack
        zip_extract::extract(File::open(mrpack_path)?, temp_extract_dir.path(), false)?;

        // Process manifest
        let manifest_path = temp_extract_dir.path().join("modrinth.index.json");
        let manifest_data = tokio::fs::read_to_string(manifest_path).await?;
        let manifest: serde_json::Value = serde_json::from_str(&manifest_data)?;

        // Download dependency files
        let files = manifest["files"].as_array().ok_or("No files in manifest")?;
        for file in files {
            let file_path = file["path"].as_str().ok_or("Missing file path")?;
            let downloads = file["downloads"].as_array().ok_or("Missing downloads")?;
            let download_url = downloads[0].as_str().ok_or("Missing download URL")?;

            let target_path = server_path.join(file_path);
            let target_dir = target_path.parent().ok_or("Invalid file path")?;
            tokio::fs::create_dir_all(target_dir).await?;

            // Add small delay to be polite to the API
            tokio::time::sleep(Duration::from_millis(25)).await;

            self.download_file(
                download_url,
                target_dir,
                Some(target_path.file_name().ok_or("Invalid file name")?.to_str().ok_or("Invalid file name")?)
            ).await?;
        }

        // Determine server type and handle accordingly
        let loaders = version_details["loaders"].as_array().ok_or("No loaders in version")?;
        let is_fabric = loaders.iter().any(|l| l.as_str().unwrap_or("") == "fabric");
        let jar_file_name = if is_fabric {
            // Handle Fabric modpack
            let minecraft_version = manifest["dependencies"]["minecraft"].as_str()
                .ok_or("Could not determine Minecraft version from modpack manifest")?;
            let loader_version = manifest["dependencies"]["fabric-loader"].as_str()
                .ok_or("Could not determine Fabric Loader version from modpack manifest")?;

            let fabric_installers_meta: serde_json::Value = self.https_get_json(
                "https://meta.fabricmc.net/v2/versions/installer"
            ).await?;

            let latest_stable_installer = fabric_installers_meta.as_array()
                .ok_or("Invalid installer meta")?
                .iter()
                .find(|v| v["stable"].as_bool().unwrap_or(false))
                .ok_or("Could not find a stable Fabric installer version")?;

            let installer_version = latest_stable_installer["version"].as_str()
                .ok_or("Missing installer version")?;

            let jar_file_name = "fabric-server-launch.jar";
            let launcher_download_url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/{}/server/jar",
                minecraft_version, loader_version, installer_version
            );

            self.download_file(
                &launcher_download_url,
                &server_path,
                Some(jar_file_name)
            ).await?;

            jar_file_name.to_string()
        } else {
            // Handle Forge modpack
            let overrides_dir = temp_extract_dir.path().join("overrides");
            if overrides_dir.exists() {
                fs_extra::dir::copy(overrides_dir, &server_path, &fs_extra::dir::CopyOptions::new())?;
            }

            let root_files = fs::read_dir(&server_path)?;
            let mut startup_scripts = Vec::new();
            let mut detected_jar = None;

            for entry in root_files {
                let entry = entry?;
                let file_name = entry.file_name().to_string_lossy().to_lowercase();
                if file_name == "run.sh" || file_name == "run.bat" {
                    startup_scripts.push(entry.path());
                } else if file_name.starts_with("forge") && file_name.ends_with(".jar") {
                    detected_jar = Some(entry.file_name().to_string_lossy().to_string());
                }
            }

            if detected_jar.is_none() && !startup_scripts.is_empty() {
                let script_content = fs::read_to_string(&startup_scripts[0])?;
                if let Some(captures) = regex::Regex::new(r"forge-.*\.jar|server\.jar")
                    .unwrap()
                    .captures(&script_content) {
                    detected_jar = Some(captures[0].to_string());
                }
            }

            if detected_jar.is_none() {
                // Final fallback: look for any .jar that isn't the installer
                let all_jars: Vec<_> = fs::read_dir(&server_path)?
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        let name = e.file_name().to_string_lossy().to_lowercase();
                        name.ends_with(".jar") && !name.contains("installer")
                    })
                    .collect();

                if all_jars.len() == 1 {
                    detected_jar = Some(all_jars[0].file_name().to_string_lossy().to_string());
                } else {
                    return Err("Could not automatically determine the main Forge server JAR file. Please check run scripts.".into());
                }
            }

            detected_jar.ok_or("No server JAR file found")?
        };

        // Create eula.txt and console log file
        tokio::fs::write(server_path.join("eula.txt"), "eula=true").await?;
        let console_log_file = server_path.join("live_console.log");
        tokio::fs::write(
            &console_log_file,
            format!("--- Server {} created from Modrinth pack at {} ---\n", 
                server_name, chrono::Local::now().to_rfc3339())
        ).await?;

        // Update server record
        let mut final_servers = self.read_servers()?;
        if let Some(server) = final_servers.iter_mut().find(|s| s.id == new_server_id) {
            server.jar_file_name = Some(jar_file_name);
            server.description = description.to_string();
            server.server_version = version_details["game_versions"].as_array()
                .map(|v| v.iter().filter_map(|s| s.as_str()).collect::<Vec<_>>().join(", "));
            server.software_type = Some(loaders.iter().filter_map(|l| l.as_str()).collect::<Vec<_>>().join(", "));
            server.status = "Offline".to_string();
            server.logo_url = version_details["project"]["icon_url"].as_str().map(String::from);
            server.console_log_file = Some(console_log_file.to_string_lossy().to_string());
            server.tags = Vec::new();
        }

        self.write_servers(&final_servers)?;

        // Link to proxy if applicable
        let new_server = final_servers.iter().find(|s| s.id == new_server_id)
            .ok_or("Failed to find newly created server")?;
        let all_servers = self.read_servers()?;
        let proxies = all_servers.iter().filter(|s| s.software_type.as_ref().map_or(false, |t| t.contains("Velocity")));

        for proxy_server in proxies {
            let proxy_path = self.get_server_folder_path(proxy_server);
            let toml_path = proxy_path.join("velocity.toml");
            
            let mut toml_config = if toml_path.exists() {
                let toml_content = tokio::fs::read_to_string(&toml_path).await?;
                toml::from_str(&toml_content)?
            } else {
                toml::value::Table::new()
            };

            let server_entry_name = new_server.name.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "");
            toml_config.insert(
                "servers".to_string(),
                toml::Value::Table({
                    let mut table = toml::value::Table::new();
                    table.insert(
                        server_entry_name.clone(),
                        toml::Value::String(format!("{}:{}", new_server.ip, new_server.port))
                    );
                    table
                })
            );

            toml_config.insert(
                "forced-hosts".to_string(),
                toml::Value::Table({
                    let mut table = toml::value::Table::new();
                    table.insert(
                        format!("{}.example.com", server_entry_name),
                        toml::Value::Array(vec![toml::Value::String(server_entry_name.clone())])
                    );
                    table
                })
            );

            if !toml_config.contains_key("try") {
                toml_config.insert(
                    "try".to_string(),
                    toml::Value::Array(vec![toml::Value::String(server_entry_name)])
                );
            }

            tokio::fs::write(&toml_path, toml::to_string(&toml_config)?).await?;
        }

        Ok(())
    }

    async fn sync_velocity_secret(&self, paper_server: &Server, velocity_proxy: &Server) -> Result<(), Box<dyn std::error::Error>> {
        let proxy_path = self.get_server_folder_path(velocity_proxy);
        let paper_server_path = self.get_server_folder_path(paper_server);

        let secret_file_path = proxy_path.join("forwarding.secret");
        let secret = if secret_file_path.exists() {
            tokio::fs::read_to_string(&secret_file_path).await?
        } else {
            let secret = rand::Rng::gen::<[u8; 12], _>(&mut rand::thread_rng());
            let secret_hex = hex::encode(secret);
            tokio::fs::write(&secret_file_path, &secret_hex).await?;
            secret_hex
        };

        let secret = secret.trim();

        let paper_config_dir = paper_server_path.join("config");
        let paper_global_yml_path = paper_config_dir.join("paper-global.yml");

        tokio::fs::create_dir_all(&paper_config_dir).await?;

        let config_content = format!(
            r#"
proxies:
  bungee-cord:
    online-mode: true
  proxy-protocol: false
  velocity:
    enabled: true
    online-mode: true
    secret: "{}"
"#,
            secret
        );

        tokio::fs::write(&paper_global_yml_path, config_content.trim()).await?;

        Ok(())
    }
}

// Implement Clone for IndexController
impl Clone for IndexController {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            active_server_processes: Arc::clone(&self.active_server_processes),
            active_log_file_streams: Arc::clone(&self.active_log_file_streams),
            stdout_buffers: Arc::clone(&self.stdout_buffers),
            app_data_root: self.app_data_root.clone(),
            servers_file_path: self.servers_file_path.clone(),
            proxies_file_path: self.proxies_file_path.clone(),
            config_file_path: self.config_file_path.clone(),
            main_servers_dir: self.main_servers_dir.clone(),
            recovery_dir: self.recovery_dir.clone(),
            backups_dir: self.backups_dir.clone(),
            templates_dir: self.templates_dir.clone(),
            http_client: self.http_client.clone(),
        }
    }
}
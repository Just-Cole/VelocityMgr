
# Velocity Manager

Velocity Manager is a comprehensive, web-based application designed to simplify the management of game servers. It provides a modern, user-friendly interface for creating, configuring, monitoring, and controlling your server instances, whether they are single PaperMC servers, complex Velocity proxy networks, or modded servers from Modrinth.

## ✨ Features

*   **Network Dashboard:** Get a high-level overview of all your game servers, their online status, current player counts, and aggregate resource usage (CPU & RAM).
*   **Server Creation & Setup:**
    *   **Single Server:** Easily create a standalone PaperMC or Velocity instance.
    *   **Proxy Network:** Automatically set up a Velocity proxy complete with a backend "Hub" server, with secure forwarding configured out-of-the-box.
    *   **Modpack Installation:** Search for and install server packs directly from Modrinth. Includes an AI assistant to suggest optimal RAM allocation based on the modpack's description.
    *   **Upload Existing Server:** Migrate an existing server by simply uploading its contents in a `.zip` file.
*   **Server Management:**
    *   **Live Console:** View real-time server console output and send commands directly from the web UI.
    *   **Player List:** See currently connected players, with options for moderation (kick, ban, message).
    *   **Resource Monitoring:** View live CPU and RAM usage for each server.
    *   **AI Log Analysis:** Use the AI assistant to diagnose server logs for critical errors and get easy-to-understand explanations and suggested fixes.
    *   **Server Actions:** Start, Stop, and Restart servers directly from the dashboard or management page.
*   **Server Configuration:**
    *   **General Settings:** Easily modify server name, port, description, RAM allocation, custom Java launch arguments, and tags.
    *   **Structured Config Editor:** A user-friendly, form-based editor for `server.properties` (PaperMC) and `velocity.toml` (Velocity) files, preventing syntax errors.
    *   **File Manager:** A full-featured file browser to view, edit, upload, create folders, rename, and delete files/folders within a server's directory.
    *   **Backup Management:** Create on-demand backups, restore a server to a previous state, download, or delete old backups.
    *   **Plugin Management:**
        *   List installed plugins and toggle their enabled/disabled state.
        *   Browse and install new plugins directly from SpigotMC's resources.
        *   Uninstall plugins with a single click.
*   **Administration & Security:**
    *   **User & Role Management:** A robust role-based access control (RBAC) system. Create custom roles, assign fine-grained permissions (e.g., `view_logs`, `start_stop_servers`), and assign roles to users.
    *   **Server Recovery:** Deleted servers are moved to a recovery area, allowing you to restore them or delete them permanently.
    *   **Profile Management:** Users can manage their own account and change their password.

## 🚀 Tech Stack

*   **Frontend:**
    *   Next.js (App Router)
    *   React & TypeScript
    *   Tailwind CSS & ShadCN UI Components
    *   Lucide React Icons
*   **Backend:**
    *   Node.js & Express.js for the API.
    *   Handles server process management, file system operations, and API logic.
*   **AI Functionality:**
    *   Google Genkit
    *   Google AI (Gemini Models) for diagnostics and recommendations.

## 🏁 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js) or yarn
*   Java (JDK 17 or later) for running Minecraft servers.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-folder>
    ```

2.  **Install project dependencies:**
    This single command will install dependencies for both the frontend (Next.js) and the backend.
    ```bash
    npm install
    ```

### Running the Application

You need to run both the frontend and backend servers concurrently. The project is set up to do this with a single command.

Open a terminal in the project root directory and run:

```bash
npm run dev
```

This will:
*   Start the **Backend API Server** (typically on `http://localhost:3005`).
*   Start the **Frontend Development Server** (typically on `http://localhost:9002`).

Once both servers are running, open your browser and navigate to the frontend URL displayed in the terminal.

## 📂 Project Structure (Simplified)

```
.
├── public/                  # Static assets (images, favicons)
├── src/
│   ├── app/                 # Next.js App Router (frontend pages, layouts)
│   │   ├── (app)/           # Main application routes (dashboard, etc.)
│   │   └── (auth)/          # Authentication routes (login)
│   ├── actions/             # Next.js Server Actions for calling AI flows
│   ├── ai/                  # Genkit AI flows and configuration
│   ├── backend/             # Node.js/Express backend server
│   │   ├── src/
│   │   │   ├── controllers/ # Backend logic for API routes (separated by concern)
│   │   │   ├── routes/      # API route definitions
│   │   │   └── index.js     # Backend server entry point
│   │   └── app_data/        # Data storage for servers, configs (created on run)
│   ├── components/          # React components (UI and custom)
│   │   └── ui/              # ShadCN UI components
│   ├── contexts/            # React Context providers (e.g., AuthContext)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Shared utilities, constants, types
│   ├── spigot-plugin/       # Source for the Spigot companion plugin
│   └── velocity-plugin/     # Source for the Velocity companion plugin
├── .env                     # Environment variables (create if needed)
├── next.config.ts           # Next.js configuration
├── package.json             # Project dependencies and scripts
└── README.md                # This file
```

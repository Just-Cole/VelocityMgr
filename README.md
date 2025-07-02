
# Velocity Manager

Velocity Manager is a comprehensive, web-based application designed to simplify the management of game servers. It provides a modern, user-friendly interface for creating, configuring, monitoring, and controlling your server instances, whether they are single PaperMC servers, complex Velocity proxy networks, or modded servers from Modrinth.

## ✨ Features

*   **Network Dashboard:** Get a high-level overview of all your game servers, their online status, current player counts, and aggregate resource usage (CPU & RAM).
*   **Server Creation & Setup:**
    *   **Single Server:** Easily create a standalone PaperMC or Velocity instance.
    *   **Proxy Network:** Create a Velocity proxy. New proxies are created using a standard template for consistency.
    *   **Modpack Installation:** Search for and install server packs directly from Modrinth. Includes an AI assistant to suggest optimal RAM allocation based on the modpack's description.
    *   **Upload Existing Server:** Migrate an existing server by simply uploading its contents in a `.zip` file.
*   **Server Management:**
    *   **Live Console:** View real-time server console output and send commands directly from the web UI.
    *   **Player List:** See currently connected players, with options for moderation (kick, ban, message).
    *   **Banned Players List:** View and manage the list of banned players for a server.
    *   **Resource Monitoring:** View live CPU and RAM usage for each server.
    *   **AI Log Analysis:** Use the AI assistant to diagnose server logs for critical errors and get easy-to-understand explanations and suggested fixes.
    *   **Server Actions:** Start, Stop, and Restart servers directly from the dashboard or management page.
*   **Server Configuration:**
    *   **General Settings:** Easily modify server name, port, description, RAM allocation, custom Java launch arguments, and tags.
    *   **File Manager & Editors:** A full-featured file browser to view, edit, upload, and manage files. Includes user-friendly editors for configuration files.
    *   **Backup Management:** Create on-demand backups, restore a server to a previous state, download, or delete old backups.
    *   **Plugin Management:**
        *   List installed plugins and toggle their enabled/disabled state.
        *   Browse and install new plugins directly from SpigotMC.
        *   Uninstall plugins with a single click.
*   **Administration & Security:**
    *   **User & Role Management:** A robust role-based access control (RBAC) system. Create custom roles, assign fine-grained permissions (e.g., `view_logs`, `start_stop_servers`), and assign roles to users.
    *   **Server Recovery:** Deleted servers are moved to a recovery area, allowing you to restore them or delete them permanently.
    *   **Profile Management:** Users can manage their own account and change their password.
*   **Desktop Application:** The entire application can be built into a standalone desktop app for Windows, macOS, and Linux using Electron.

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
*   **Desktop Packaging:**
    *   Electron
    *   Electron Builder

## 💼 Business Model

Velocity Manager will operate on a **Freemium model**, providing essential tools for free while offering advanced, high-value features for paid users. This approach supports both hobbyist server owners and larger communities or businesses.

### Tiers

| Feature                      | Community Edition (Free)                                  | Pro Edition (Paid)                                         |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| **Server Limit**             | Up to 3 servers                                           | ✅ **Unlimited servers**                                     |
| **Core Management**          | ✅ Start, Stop, Console, Player List, File Manager        | ✅ All core features                                       |
| **User Management**          | Basic (Admin, Operator, etc.)                             | ✅ **Full RBAC (custom roles & permissions)**              |
| **Backups**                  | Manual on-demand backups                                  | ✅ **Automated & Scheduled Backups**                       |
| **AI Log Diagnostics**       | ❌                                                        | ✅ **Unlimited analysis**                                  |
| **AI RAM Advisor**           | ❌                                                        | ✅ **Unlimited suggestions**                               |
| **AI Config Advisor**        | ❌                                                        | ✅ **Advanced configuration suggestions**                    |
| **One-Click Installers**     | ✅ Spigot Plugins                                         | ✅ **Modrinth Modpacks & Spigot Plugins**                    |
| **Priority Support**         | Community Support                                         | ✅ **Email & Discord Priority Support**                      |

### Enterprise

For large-scale server networks or commercial hosting providers, a custom **Enterprise** plan will be available, offering features like API access for automation, dedicated support with SLAs, and potential white-labeling options.

## ❤️ Supporting Mod Authors

We believe that mod authors are the lifeblood of the Minecraft community, and supporting them is a top priority. Velocity Manager is designed to respect their work and contribute positively to the ecosystem.

*   **No Re-hosting:** We **do not** re-host or redistribute modpacks or individual mods. All downloads are fetched directly from official sources like Modrinth using their public APIs.
*   **Counting Downloads:** By fetching directly from the source, we ensure that every download through Velocity Manager correctly increments the author's download count on their platform, which often contributes to their revenue and visibility.
*   **Driving Support:** We will always display the author's name and provide prominent links back to the original Modrinth/CurseForge page, encouraging users to support them directly through donations, Patreon, or other methods they provide.
*   **Respecting Licenses:** We operate strictly within the Terms of Service of the platforms we interact with and respect the licenses chosen by mod authors for their work.

Our business model is based on providing a powerful management tool, not on profiting from the distribution of others' work. Our goal is to make it easier for players to enjoy modded Minecraft while ensuring the creators receive the credit and support they deserve.

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

### Running in Development Mode

This is the standard way to run the application for development. It runs the frontend and backend as separate processes with hot-reloading.

Open a terminal in the project root directory and run:

```bash
npm run dev
```

This will:
*   Start the **Backend API Server** (typically on `http://localhost:3005`).
*   Start the **Frontend Development Server** (typically on `http://localhost:9002`).

Once both servers are running, open your browser and navigate to the frontend URL displayed in the terminal.

### Running in Desktop (Electron) Mode

This mode simulates the packaged desktop application. It's useful for testing desktop-specific functionality.

```bash
npm run electron:dev
```

This will start the backend, the frontend, and then launch the Electron app window which loads the frontend URL.

### Building the Desktop Application

To create a distributable desktop application (`.exe`, `.dmg`, etc.), run the following command:

```bash
npm run electron:build
```

This will create a `release` folder in your project root containing the packaged application for your operating system.

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
├── electron.js              # Main process script for the Electron desktop app
├── config.json              # Global application settings (ports, etc.)
├── next.config.ts           # Next.js configuration
├── package.json             # Project dependencies and scripts
└── README.md                # This file
```

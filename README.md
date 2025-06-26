<<<<<<< HEAD
<<<<<<< HEAD

# Velocity Manager

Velocity Manager is a web application designed to simplify the management of game servers, particularly Minecraft servers using PaperMC and Velocity proxies. It provides a user-friendly interface for creating, configuring, monitoring, and controlling your server instances.

## ✨ Features

*   **Server Dashboard:** Overview of all your game servers, their status, and key metrics.
*   **Server Creation:**
    *   Simplified setup for single PaperMC or Velocity instances.
    *   Automated creation of full proxy networks (Velocity proxy + backend PaperMC servers like Hub & Survival) with pre-configured templates.
    *   Dynamic fetching of latest PaperMC/Velocity versions and builds.
*   **Server Management:**
    *   **Live Console:** View real-time server console output and send commands.
    *   **Player List:** See currently connected players with options for moderation (kick, ban, message - via console commands).
    *   **Banned Players:** View and manage the list of banned players for a server.
    *   **Resource Monitoring:** (Placeholder) View CPU and RAM usage.
    *   **Server Actions:** Start, Stop, and Restart servers directly from the dashboard or management page.
*   **Server Editing & Configuration:**
    *   **File Manager:** Browse, view, edit (for text-based files like `.yml`, `.properties`, `.toml`, `.secret`), upload, create folders, rename, and delete files/folders within a server's directory.
    *   **Settings:** Modify server name, port, description, RAM allocation, custom launch arguments, and max players.
    *   **Plugin Management:** (Basic) List installed plugins, toggle enabled/disabled state (by renaming `.jar` to `.jar.disabled`), install plugins from Hangar, and uninstall plugins.
*   **Application Settings:** (Placeholder) Customize application appearance, notifications, and other global preferences.
*   **AI Advisor:** Get AI-powered suggestions for optimized server configurations based on your requirements.
*   **Modern UI:** Built with ShadCN UI components and Tailwind CSS for a clean and responsive experience.

## 🚀 Tech Stack

*   **Frontend:**
    *   Next.js (App Router)
    *   React
    *   TypeScript
    *   Tailwind CSS
    *   ShadCN UI Components
    *   Lucide React Icons
*   **Backend:**
    *   Node.js
    *   Express.js
*   **AI Functionality:**
    *   Genkit
    *   Google AI (Gemini)
*   **Development Tools:**
    *   Turbopack
    *   ESLint, Prettier (implied by typical Next.js setup)

## 🏁 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js) or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-folder>
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```
    (This will also install `rimraf` which is used in the `dev` script).

3.  **Install backend dependencies:**
    Navigate to the backend directory and install its dependencies:
    ```bash
    cd src/backend
    npm install
    cd ../..
    ```

### Running the Application

You need to run both the frontend and backend servers.

**Option 1: Using Batch Files (for Windows)**

*   **`start-dev.bat`**: Runs frontend and backend in separate command prompt windows.
    ```bash
    start-dev.bat
    ```
*   **`start-dev-single-window.bat`**: Runs frontend and backend in a single command prompt window.
    ```bash
    start-dev-single-window.bat
    ```
    (Note: `Ctrl+C` in the single window might only stop the frontend. You may need to close the backend process manually via Task Manager.)

**Option 2: Manual Startup (Cross-platform)**

1.  **Start the Backend Server:**
    Open a terminal, navigate to the `src/backend` directory, and run:
    ```bash
    npm start
    ```
    The backend server will typically run on `http://localhost:4001`.

2.  **Start the Frontend Development Server:**
    Open another terminal in the project root directory and run:
    ```bash
    npm run dev
    ```
    The frontend development server will run on `http://localhost:4000`.

Once both servers are running, open your browser and navigate to `http://localhost:4000`.

## 📂 Project Structure (Simplified)

```
.
├── public/                  # Static assets (images, favicons)
├── src/
│   ├── app/                 # Next.js App Router (frontend pages, layouts)
│   │   ├── (app)/           # Authenticated/main application routes
│   │   └── ...
│   ├── actions/             # Server Actions for form submissions / mutations
│   ├── ai/                  # Genkit AI flows and configuration
│   ├── backend/             # Node.js/Express backend server
│   │   ├── src/
│   │   │   ├── controllers/ # Backend logic for API routes
│   │   │   ├── routes/      # API route definitions
│   │   │   └── index.js     # Backend server entry point
│   │   └── app_data/        # Data storage for servers, configs (created on run)
│   ├── components/          # React components (UI and custom)
│   │   └── ui/              # ShadCN UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Shared utilities, constants, types
│   └── ...
├── .env                     # Environment variables (create if needed)
├── next.config.ts           # Next.js configuration
├── package.json             # Project dependencies and scripts
├── tailwind.config.ts       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Open a Pull Request.

Please make sure to update tests as appropriate.

## 📄 License

This project is licensed under the [MIT License](LICENSE.md) (You'll need to create a LICENSE.md file if you choose this license).
```
=======
# Firebase Studio
=======
>>>>>>> e06a37c (vv)

# Velocity Manager

<<<<<<< HEAD
To get started, take a look at src/app/page.tsx.
>>>>>>> 73da13e (initial scaffold)
=======
Velocity Manager is a web application designed to simplify the management of game servers, particularly Minecraft servers using PaperMC and Velocity proxies. It provides a user-friendly interface for creating, configuring, monitoring, and controlling your server instances.

## ✨ Features

*   **Server Dashboard:** Overview of all your game servers, their status, and key metrics.
*   **Server Creation:**
    *   Simplified setup for single PaperMC or Velocity instances.
    *   Automated creation of full proxy networks (Velocity proxy + backend PaperMC servers like Hub & Survival) with pre-configured templates.
    *   Dynamic fetching of latest PaperMC/Velocity versions and builds.
*   **Server Management:**
    *   **Live Console:** View real-time server console output and send commands.
    *   **Player List:** See currently connected players with options for moderation (kick, ban, message - via console commands).
    *   **Banned Players:** View and manage the list of banned players for a server.
    *   **Resource Monitoring:** (Placeholder) View CPU and RAM usage.
    *   **Server Actions:** Start, Stop, and Restart servers directly from the dashboard or management page.
*   **Server Editing & Configuration:**
    *   **File Manager:** Browse, view, edit (for text-based files like `.yml`, `.properties`, `.toml`, `.secret`), upload, create folders, rename, and delete files/folders within a server's directory.
    *   **Settings:** Modify server name, port, description, RAM allocation, custom launch arguments, and max players.
    *   **Plugin Management:** (Basic) List installed plugins, toggle enabled/disabled state (by renaming `.jar` to `.jar.disabled`), install plugins from Hangar, and uninstall plugins.
*   **Application Settings:** (Placeholder) Customize application appearance, notifications, and other global preferences.
*   **AI Advisor:** Get AI-powered suggestions for optimized server configurations based on your requirements.
*   **Modern UI:** Built with ShadCN UI components and Tailwind CSS for a clean and responsive experience.

## 🚀 Tech Stack

*   **Frontend:**
    *   Next.js (App Router)
    *   React
    *   TypeScript
    *   Tailwind CSS
    *   ShadCN UI Components
    *   Lucide React Icons
*   **Backend:**
    *   Node.js
    *   Express.js
*   **AI Functionality:**
    *   Genkit
    *   Google AI (Gemini)
*   **Development Tools:**
    *   Turbopack
    *   ESLint, Prettier (implied by typical Next.js setup)

## 🏁 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js) or yarn

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-folder>
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```
    (This will also install `rimraf` which is used in the `dev` script).

3.  **Install backend dependencies:**
    Navigate to the backend directory and install its dependencies:
    ```bash
    cd src/backend
    npm install
    cd ../..
    ```

### Running the Application

You need to run both the frontend and backend servers.

**Option 1: Using Batch Files (for Windows)**

*   **`start-dev.bat`**: Runs frontend and backend in separate command prompt windows.
    ```bash
    start-dev.bat
    ```
*   **`start-dev-single-window.bat`**: Runs frontend and backend in a single command prompt window.
    ```bash
    start-dev-single-window.bat
    ```
    (Note: `Ctrl+C` in the single window might only stop the frontend. You may need to close the backend process manually via Task Manager.)

**Option 2: Manual Startup (Cross-platform)**

1.  **Start the Backend Server:**
    Open a terminal, navigate to the `src/backend` directory, and run:
    ```bash
    npm start
    ```
    The backend server will typically run on `http://localhost:4001`.

2.  **Start the Frontend Development Server:**
    Open another terminal in the project root directory and run:
    ```bash
    npm run dev
    ```
    The frontend development server will run on `http://localhost:4000`.

Once both servers are running, open your browser and navigate to `http://localhost:4000`.

## 📂 Project Structure (Simplified)

```
.
├── public/                  # Static assets (images, favicons)
├── src/
│   ├── app/                 # Next.js App Router (frontend pages, layouts)
│   │   ├── (app)/           # Authenticated/main application routes
│   │   └── ...
│   ├── actions/             # Server Actions for form submissions / mutations
│   ├── ai/                  # Genkit AI flows and configuration
│   ├── backend/             # Node.js/Express backend server
│   │   ├── src/
│   │   │   ├── controllers/ # Backend logic for API routes
│   │   │   ├── routes/      # API route definitions
│   │   │   └── index.js     # Backend server entry point
│   │   └── app_data/        # Data storage for servers, configs (created on run)
│   ├── components/          # React components (UI and custom)
│   │   └── ui/              # ShadCN UI components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Shared utilities, constants, types
│   └── ...
├── .env                     # Environment variables (create if needed)
├── next.config.ts           # Next.js configuration
├── package.json             # Project dependencies and scripts
├── tailwind.config.ts       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add some feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Open a Pull Request.

Please make sure to update tests as appropriate.

## 📄 License

This project is licensed under the [MIT License](LICENSE.md) (You'll need to create a LICENSE.md file if you choose this license).
```
>>>>>>> e06a37c (vv)

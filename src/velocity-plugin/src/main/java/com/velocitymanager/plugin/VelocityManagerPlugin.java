package com.velocitymanager.plugin;

import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandManager;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitymanager.plugin.command.ManageCommand;
import com.velocitymanager.plugin.service.ApiService;
import org.slf4j.Logger;

/**
 * Main class for the Velocity Manager in-game plugin.
 *
 * To build this plugin, navigate to the `src/velocity-plugin` directory
 * in your terminal and run the command: `mvn clean package`.
 * This will create the plugin .jar file in the `target` directory.
 */
@Plugin(
    id = "velocitymanagerplugin",
    name = "VelocityManagerPlugin",
    version = "1.0.0",
    description = "In-game GUI for Velocity Manager",
    authors = {"VelocityManager"}
)
public class VelocityManagerPlugin {

    private final ProxyServer server;
    private final Logger logger;
    private final ApiService apiService;

    @Inject
    public VelocityManagerPlugin(ProxyServer server, Logger logger) {
        this.server = server;
        this.logger = logger;
        // The API URL should be configurable in a real plugin.
        this.apiService = new ApiService("http://localhost:3005/api");
        logger.info("VelocityManagerPlugin has been loaded!");
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        CommandManager commandManager = server.getCommandManager();
        CommandMeta commandMeta = commandManager.metaBuilder("vmanage")
            .aliases("vm")
            .build();

        commandManager.register(commandMeta, new ManageCommand(this));
        logger.info("Registered /vmanage command.");
    }

    public ProxyServer getProxyServer() {
        return server;
    }

    public Logger getLogger() {
        return logger;
    }

    public ApiService getApiService() {
        return apiService;
    }
}

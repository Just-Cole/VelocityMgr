package com.velocitymanager.plugin;

import com.google.inject.Inject;
import com.velocitypowered.api.command.CommandManager;
import com.velocitypowered.api.command.CommandMeta;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.PluginMessageEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.ServerConnection;
import com.velocitypowered.api.proxy.messages.ChannelIdentifier;
import com.velocitypowered.api.proxy.messages.MinecraftChannelIdentifier;
import com.velocitymanager.plugin.command.ManageCommand;
import com.velocitymanager.plugin.model.GameServer;
import com.velocitymanager.plugin.service.ApiService;
import com.google.gson.Gson;
import org.slf4j.Logger;

import java.nio.charset.StandardCharsets;
import java.util.List;

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
    private final Gson gson = new Gson();

    private final ChannelIdentifier channelIdentifier = MinecraftChannelIdentifier.create("vmanager", "main");

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
        // Register Channel
        server.getChannelRegistrar().register(channelIdentifier);

        // Register Command
        CommandManager commandManager = server.getCommandManager();
        CommandMeta commandMeta = commandManager.metaBuilder("vmanage")
            .aliases("vm")
            .build();

        commandManager.register(commandMeta, new ManageCommand(this));
        logger.info("Registered /vmanage command.");
    }

    @Subscribe
    public void onPluginMessage(PluginMessageEvent event) {
        if (!event.getIdentifier().equals(channelIdentifier)) {
            return;
        }

        if (!(event.getSource() instanceof ServerConnection)) {
            return;
        }

        ServerConnection source = (ServerConnection) event.getSource();
        String message = new String(event.getData(), StandardCharsets.UTF_8);
        String[] parts = message.split(":", 3);

        if (parts.length > 0) {
            String command = parts[0];
            if ("GET_SERVERS".equals(command)) {
                handleGetServers(source);
            } else if ("ACTION".equals(command) && parts.length == 3) {
                String action = parts[1];
                String serverName = parts[2];
                handleServerAction(source, action, serverName);
            }
        }
    }

    private void handleGetServers(ServerConnection source) {
        apiService.fetchServers().thenAcceptAsync(servers -> {
            String json = gson.toJson(servers);
            String responseMessage = "SERVERS:" + json;
            source.sendPluginMessage(channelIdentifier, responseMessage.getBytes(StandardCharsets.UTF_8));
        }, server.getScheduler().createExecutor(this)).exceptionally(ex -> {
            logger.error("Failed to fetch servers for backend request.", ex);
            return null;
        });
    }

    private void handleServerAction(ServerConnection source, String action, String serverName) {
        apiService.fetchServers().thenAcceptAsync(servers -> {
            GameServer targetServer = servers.stream()
                .filter(s -> s.name().equalsIgnoreCase(serverName))
                .findFirst()
                .orElse(null);

            if (targetServer != null) {
                apiService.performServerAction(targetServer, action)
                    .thenAccept(responseMsg -> {
                        String message = "ACTION_RESPONSE:success:" + responseMsg;
                        source.sendPluginMessage(channelIdentifier, message.getBytes(StandardCharsets.UTF_8));
                    })
                    .exceptionally(ex -> {
                        String errorMsg = "ACTION_RESPONSE:error:Failed to " + action + " server: " + ex.getCause().getMessage();
                        source.sendPluginMessage(channelIdentifier, errorMsg.getBytes(StandardCharsets.UTF_8));
                        return null;
                    });
            } else {
                 String errorMsg = "ACTION_RESPONSE:error:Server '" + serverName + "' not found.";
                 source.sendPluginMessage(channelIdentifier, errorMsg.getBytes(StandardCharsets.UTF_8));
            }
        }, server.getScheduler().createExecutor(this));
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

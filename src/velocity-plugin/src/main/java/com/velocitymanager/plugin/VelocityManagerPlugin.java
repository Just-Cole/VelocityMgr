
package com.velocitymanager.plugin;

import com.google.gson.Gson;
import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.PluginMessageEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.proxy.ProxyServer;
import com.velocitypowered.api.proxy.ServerConnection;
import com.velocitypowered.api.proxy.messages.ChannelIdentifier;
import com.velocitypowered.api.proxy.messages.MinecraftChannelIdentifier;
import com.velocitymanager.plugin.command.ManageCommand;
import com.velocitymanager.plugin.model.GameServer;
import com.velocitymanager.plugin.service.ApiService;
import org.slf4j.Logger;

import java.nio.charset.StandardCharsets;

/**
 * Main class for the Velocity Manager in-game plugin.
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
        this.apiService = new ApiService("http://127.0.0.1:3005/api");
        logger.info("VelocityManagerPlugin has been loaded!");
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
        // Register Channel
        server.getChannelRegistrar().register(channelIdentifier);

        // Register Command
        server.getCommandManager().register("vmanage", new ManageCommand(this), "vm");
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
        String[] parts = message.split(":", 2);
        String command = parts[0];
        String data = parts.length > 1 ? parts[1] : "";

        switch(command) {
            case "GET_SERVERS":
                handleGetServers(source);
                break;
            case "ACTION":
                String[] actionParts = data.split(":", 2);
                if (actionParts.length == 2) {
                    handleServerAction(source, actionParts[0], actionParts[1]);
                }
                break;
            case "CREATE_SERVER":
                handleCreateServer(source, data);
                break;
        }
    }

    private void handleGetServers(ServerConnection source) {
        apiService.fetchServers().thenAccept(servers -> {
            server.getScheduler().buildTask(this, () -> {
                String json = gson.toJson(servers);
                String responseMessage = "SERVERS:" + json;
                source.sendPluginMessage(channelIdentifier, responseMessage.getBytes(StandardCharsets.UTF_8));
            }).schedule();
        }).exceptionally(ex -> {
            logger.error("Failed to fetch servers for backend request.", ex);
            return null;
        });
    }

    private void handleServerAction(ServerConnection source, String action, String serverName) {
        apiService.fetchServers().thenAccept(servers -> {
            GameServer targetServer = servers.stream()
                .filter(s -> s.name().equalsIgnoreCase(serverName))
                .findFirst()
                .orElse(null);

            if (targetServer != null) {
                apiService.performServerAction(targetServer, action)
                    .thenAccept(responseMsg -> {
                        server.getScheduler().buildTask(this, () -> {
                            String message = "ACTION_RESPONSE:success:" + responseMsg;
                            source.sendPluginMessage(channelIdentifier, message.getBytes(StandardCharsets.UTF_8));
                        }).schedule();
                    })
                    .exceptionally(ex -> {
                        server.getScheduler().buildTask(this, () -> {
                            String errorMsg = "ACTION_RESPONSE:error:Failed to " + action + " server: " + ex.getMessage();
                            source.sendPluginMessage(channelIdentifier, errorMsg.getBytes(StandardCharsets.UTF_8));
                        }).schedule();
                        return null;
                    });
            } else {
                 server.getScheduler().buildTask(this, () -> {
                    String errorMsg = "ACTION_RESPONSE:error:Server '" + serverName + "' not found.";
                    source.sendPluginMessage(channelIdentifier, errorMsg.getBytes(StandardCharsets.UTF_8));
                 }).schedule();
            }
        });
    }

    private void handleCreateServer(ServerConnection source, String jsonPayload) {
        apiService.createServer(jsonPayload)
            .thenAccept(responseMsg -> {
                server.getScheduler().buildTask(this, () -> {
                    String message = "CREATION_RESPONSE:success:" + responseMsg;
                    source.sendPluginMessage(channelIdentifier, message.getBytes(StandardCharsets.UTF_8));
                }).schedule();
            })
            .exceptionally(ex -> {
                server.getScheduler().buildTask(this, () -> {
                    String errorMsg = "CREATION_RESPONSE:error:Failed to create server: " + ex.getMessage();
                    source.sendPluginMessage(channelIdentifier, errorMsg.getBytes(StandardCharsets.UTF_8));
                }).schedule();
                return null;
            });
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

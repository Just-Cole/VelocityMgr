
package com.velocitymanager.plugin.command;

import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import com.velocitymanager.plugin.VelocityManagerPlugin;
import com.velocitymanager.plugin.model.GameServer;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

import java.util.Arrays;
import java.util.concurrent.CompletableFuture;
import java.util.List;
import java.util.stream.Collectors;

public class ManageCommand implements SimpleCommand {

    private final VelocityManagerPlugin plugin;

    public ManageCommand(VelocityManagerPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public void execute(final Invocation invocation) {
        if (!(invocation.source() instanceof Player)) {
            invocation.source().sendMessage(Component.text("This command can only be used by a player.", NamedTextColor.RED));
            return;
        }

        Player player = (Player) invocation.source();
        String[] args = invocation.arguments();

        if (args.length == 0) {
            listServers(player);
            return;
        }

        String action = args[0].toLowerCase();
        if (!(action.equals("start") || action.equals("stop") || action.equals("restart"))) {
            player.sendMessage(Component.text("Invalid action. Usage: /vmanage <start|stop|restart> <server_name>", NamedTextColor.RED));
            return;
        }

        if (args.length < 2) {
            player.sendMessage(Component.text("Please specify a server name.", NamedTextColor.RED));
            return;
        }

        boolean isConfirmed = args[args.length - 1].equalsIgnoreCase("--confirm");
        int serverNameEndIndex = isConfirmed ? args.length - 1 : args.length;
        String serverName = String.join(" ", Arrays.copyOfRange(args, 1, serverNameEndIndex));

        if (serverName.trim().isEmpty()) {
            player.sendMessage(Component.text("Please specify a server name.", NamedTextColor.RED));
            return;
        }

        handleServerAction(player, serverName, action, isConfirmed);
    }

    private void listServers(Player player) {
        player.sendMessage(Component.text("Fetching server list...", NamedTextColor.GRAY));
        plugin.getApiService().fetchServers().thenAcceptAsync(servers -> {
            player.sendMessage(Component.text("--- Available Servers ---", NamedTextColor.GOLD).decoration(TextDecoration.BOLD, true));
            if (servers.isEmpty()) {
                player.sendMessage(Component.text("No servers found.", NamedTextColor.GRAY));
                return;
            }
            for (GameServer server : servers) {
                Component serverLine = Component.text()
                        .append(Component.text(server.name(), NamedTextColor.WHITE))
                        .append(Component.text(" (" + server.status() + ") - ", NamedTextColor.GRAY))
                        .append(Component.text("[Start]", NamedTextColor.GREEN, TextDecoration.BOLD)
                                .hoverEvent(Component.text("Click to start " + server.name()))
                                .clickEvent(ClickEvent.runCommand("/vmanage start " + server.name())))
                        .append(Component.text(" "))
                        .append(Component.text("[Stop]", NamedTextColor.RED, TextDecoration.BOLD)
                                .hoverEvent(Component.text("Click to stop " + server.name()))
                                .clickEvent(ClickEvent.runCommand("/vmanage stop " + server.name())))
                        .append(Component.text(" "))
                        .append(Component.text("[Restart]", NamedTextColor.YELLOW, TextDecoration.BOLD)
                                .hoverEvent(Component.text("Click to restart " + server.name()))
                                .clickEvent(ClickEvent.runCommand("/vmanage restart " + server.name())))
                        .build();
                player.sendMessage(serverLine);
            }
        }, plugin.getProxyServer().getScheduler().createExecutor(plugin)).exceptionally(ex -> {
            player.sendMessage(Component.text("Failed to fetch server list: " + ex.getMessage(), NamedTextColor.RED));
            plugin.getLogger().error("Failed to fetch server list", ex);
            return null;
        });
    }

    private void handleServerAction(Player player, String serverName, String action, boolean isConfirmed) {
        player.sendMessage(Component.text("Requesting to " + action + " server '" + serverName + "'...", NamedTextColor.GRAY));
        plugin.getApiService().fetchServers().thenAcceptAsync(servers -> {
            GameServer targetServer = servers.stream()
                    .filter(s -> s.name().equalsIgnoreCase(serverName))
                    .findFirst()
                    .orElse(null);

            if (targetServer == null) {
                player.sendMessage(Component.text("Server '" + serverName + "' not found.", NamedTextColor.RED));
                return;
            }
            
            // Safety check for stopping/restarting the current proxy
            int currentProxyPort = plugin.getProxyServer().getBoundAddress().getPort();
            if (targetServer.port() == currentProxyPort && (action.equals("stop") || action.equals("restart")) && !isConfirmed) {
                player.sendMessage(Component.text("Warning: You are trying to " + action + " the proxy you are connected to.", NamedTextColor.YELLOW));
                player.sendMessage(Component.text("This will disconnect all players. To proceed, run this command again with --confirm at the end, or click here: ", NamedTextColor.YELLOW)
                        .append(Component.text("/vmanage " + action + " " + serverName + " --confirm", NamedTextColor.RED)
                                .clickEvent(ClickEvent.suggestCommand("/vmanage " + action + " " + serverName + " --confirm"))
                        )
                );
                return;
            }


            plugin.getApiService().performServerAction(targetServer, action).thenAccept(responseMessage -> {
                player.sendMessage(Component.text(responseMessage, NamedTextColor.GREEN));
            }).exceptionally(ex -> {
                player.sendMessage(Component.text("Failed to " + action + " server: " + ex.getCause().getMessage(), NamedTextColor.RED));
                return null;
            });
        }, plugin.getProxyServer().getScheduler().createExecutor(plugin)).exceptionally(ex -> {
             player.sendMessage(Component.text("Error finding server: " + ex.getMessage(), NamedTextColor.RED));
             return null;
        });
    }

    @Override
    public boolean hasPermission(final Invocation invocation) {
        return invocation.source().hasPermission("velocitymanager.manage");
    }

    @Override
    public CompletableFuture<List<String>> suggestAsync(final Invocation invocation) {
        String[] args = invocation.arguments();
        
        // If --confirm is the last argument, don't suggest anything further.
        if (args.length > 1 && args[args.length - 1].equalsIgnoreCase("--confirm")) {
            return CompletableFuture.completedFuture(java.util.Collections.emptyList());
        }
        
        // Suggest actions: start, stop, restart
        if (args.length <= 1) {
            return CompletableFuture.completedFuture(
                List.of("start", "stop", "restart").stream()
                    .filter(s -> s.startsWith(args.length == 1 ? args[0].toLowerCase() : ""))
                    .collect(Collectors.toList())
            );
        }
        
        // Suggest server names for the selected action
        if (args.length >= 2) {
             String action = args[0].toLowerCase();
             if (List.of("start", "stop", "restart").contains(action)) {
                 final String currentInput = String.join(" ", Arrays.copyOfRange(args, 1, args.length)).toLowerCase();
                 return plugin.getApiService().fetchServers().thenApply(servers ->
                    servers.stream()
                            .map(GameServer::name)
                            .filter(name -> name.toLowerCase().startsWith(currentInput))
                            .collect(Collectors.toList())
                );
             }
        }
        return CompletableFuture.completedFuture(java.util.Collections.emptyList());
    }
}

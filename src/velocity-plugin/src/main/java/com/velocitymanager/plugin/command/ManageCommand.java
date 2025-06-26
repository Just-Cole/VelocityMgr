package com.velocitymanager.plugin.command;

import com.velocitypowered.api.command.SimpleCommand;
import com.velocitypowered.api.proxy.Player;
import com.velocitymanager.plugin.VelocityManagerPlugin;
import com.velocitymanager.plugin.ui.ServerListUI;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

import java.util.concurrent.CompletableFuture;

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
        
        // Open the server list UI for the player
        plugin.getProxyServer().getScheduler().buildTask(plugin, () -> {
            new ServerListUI(plugin, player).open();
        }).schedule();
    }

    @Override
    public boolean hasPermission(final Invocation invocation) {
        // We recommend using a permissions plugin like LuckPerms in a real scenario.
        return invocation.source().hasPermission("velocitymanager.manage");
    }

    @Override
    public CompletableFuture<java.util.List<String>> suggestAsync(final Invocation invocation) {
        return CompletableFuture.completedFuture(java.util.Collections.emptyList());
    }
}

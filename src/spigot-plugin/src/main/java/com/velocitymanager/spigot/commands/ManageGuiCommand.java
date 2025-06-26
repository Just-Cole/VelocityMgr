package com.velocitymanager.spigot.commands;

import com.velocitymanager.spigot.SpigotVManager;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;

import java.nio.charset.StandardCharsets;

public class ManageGuiCommand implements CommandExecutor {

    private final SpigotVManager plugin;

    public ManageGuiCommand(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, @NotNull String[] args) {
        if (!(sender instanceof Player)) {
            sender.sendMessage(Component.text("This command can only be used by a player.", NamedTextColor.RED));
            return true;
        }

        Player player = (Player) sender;
        
        // Send a message to the proxy to request the server list
        player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, "GET_SERVERS".getBytes(StandardCharsets.UTF_8));
        
        player.sendMessage(Component.text("Fetching server list from proxy...", NamedTextColor.GRAY));
        
        return true;
    }
}

package com.velocitymanager.plugin.ui;

import com.velocitymanager.plugin.VelocityManagerPlugin;
import com.velocitymanager.plugin.model.GameServer;
import com.velocitypowered.api.proxy.Player;
import net.kyori.adventure.inventory.Inventory;
import net.kyori.adventure.inventory.InventoryType;
import net.kyori.adventure.item.ItemStack;
import net.kyori.adventure.item.ItemTypes;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;

import java.util.Collections;

public class ServerActionUI {

    private final VelocityManagerPlugin plugin;
    private final Player player;
    private final GameServer server;

    public ServerActionUI(VelocityManagerPlugin plugin, Player player, GameServer server) {
        this.plugin = plugin;
        this.player = player;
        this.server = server;
    }

    public void open() {
        Inventory inventory = Inventory.builder()
            .type(InventoryType.CHEST_9)
            .title(Component.text("Manage: " + server.name()))
            .build();

        // Start button
        ItemStack startItem = ItemStack.builder(ItemTypes.LIME_DYE)
            .displayName(Component.text("Start Server", NamedTextColor.GREEN))
            .lore(Collections.singletonList(Component.text("Click to start this server", NamedTextColor.GRAY)))
            .build();

        // Stop button
        ItemStack stopItem = ItemStack.builder(ItemTypes.RED_DYE)
            .displayName(Component.text("Stop Server", NamedTextColor.RED))
            .lore(Collections.singletonList(Component.text("Click to stop this server", NamedTextColor.GRAY)))
            .build();

        // Restart button
        ItemStack restartItem = ItemStack.builder(ItemTypes.YELLOW_DYE)
            .displayName(Component.text("Restart Server", NamedTextColor.YELLOW))
            .lore(Collections.singletonList(Component.text("Click to restart this server", NamedTextColor.GRAY)))
            .build();

        inventory.setItem(2, startItem);
        inventory.setItem(4, stopItem);
        inventory.setItem(6, restartItem);

        player.openInventory(inventory, click -> {
            click.getInventory().close();
            int slot = click.getSlot();
            switch(slot) {
                case 2: // Start
                    performAction("start");
                    break;
                case 4: // Stop
                    performAction("stop");
                    break;
                case 6: // Restart
                    performAction("restart");
                    break;
            }
        });
    }

    private void performAction(String action) {
        player.sendMessage(Component.text("Sending " + action + " request for " + server.name() + "...", NamedTextColor.GRAY));
        plugin.getApiService().performServerAction(server, action).thenAccept(responseMessage -> {
            player.sendMessage(Component.text(responseMessage, NamedTextColor.GREEN));
        }).exceptionally(ex -> {
            player.sendMessage(Component.text("Failed to " + action + " server: " + ex.getMessage(), NamedTextColor.RED));
            return null;
        });
    }
}

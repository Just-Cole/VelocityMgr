package com.velocitymanager.spigot.listeners;

import com.velocitymanager.spigot.SpigotVManager;
import com.velocitymanager.spigot.ui.ServerActionUI;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.jetbrains.annotations.Nullable;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;

import java.nio.charset.StandardCharsets;

public class GuiListener implements Listener {
    private final SpigotVManager plugin;

    public GuiListener(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        String mainTitle = plugin.getServerListUI().getInventoryTitle();
        String actionTitlePrefix = ServerActionUI.getInventoryTitlePrefix();
        String viewTitle = event.getView().title().examinableName();
        
        boolean isVManagerGui = viewTitle.equals(mainTitle) || viewTitle.startsWith(actionTitlePrefix);

        if (!isVManagerGui || !(event.getWhoClicked() instanceof Player)) {
            return;
        }

        event.setCancelled(true);
        Player player = (Player) event.getWhoClicked();
        ItemStack clickedItem = event.getCurrentItem();

        if (clickedItem == null || clickedItem.getItemMeta() == null) {
            return;
        }

        PersistentDataContainer data = clickedItem.getItemMeta().getPersistentDataContainer();
        String serverName = data.get(ServerActionUI.SERVER_NAME_KEY, PersistentDataType.STRING);
        String action = data.get(ServerActionUI.ACTION_KEY, PersistentDataType.STRING);

        if (action != null && serverName != null) {
            handleAction(player, serverName, action);
            player.closeInventory();
        } else if (serverName != null) {
            // It's a server item from the main list, open the action UI
            plugin.getServerListUI().getServerByName(serverName).thenAccept(serverOpt -> {
                serverOpt.ifPresent(server -> {
                    ServerActionUI.open(player, server);
                });
            });
        }
    }

    private void handleAction(Player player, String serverName, String action) {
        String message = "ACTION:" + action + ":" + serverName;
        player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, message.getBytes(StandardCharsets.UTF_8));
    }
}

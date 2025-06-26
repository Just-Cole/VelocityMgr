
package com.velocitymanager.spigot.listeners;

import com.velocitymanager.spigot.SpigotVManager;
import com.velocitymanager.spigot.model.GameServer;
import com.velocitymanager.spigot.ui.ServerActionUI;
import com.velocitymanager.spigot.ui.ServerListUI;
import net.kyori.adventure.text.TextComponent;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

public class GuiListener implements Listener {
    private final SpigotVManager plugin;

    public GuiListener(SpigotVManager plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        String mainGuiTitle = plugin.getServerListUI().getInventoryTitle();
        String actionGuiPrefix = ServerActionUI.getInventoryTitlePrefix();
        String clickedGuiTitle;
        try {
            // This is a more robust way to get the plain text from an Adventure Component title
            clickedGuiTitle = ((TextComponent) event.getView().title()).content();
        } catch (ClassCastException e) {
            // The title is not a simple TextComponent, so it's not our GUI.
            return;
        }

        // If the title doesn't match one of our GUIs, do nothing.
        if (!clickedGuiTitle.equals(mainGuiTitle) && !clickedGuiTitle.startsWith(actionGuiPrefix)) {
            return;
        }

        // It is one of our GUIs, so we MUST cancel the event to prevent item movement.
        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player)) {
            return;
        }

        Player player = (Player) event.getWhoClicked();
        ItemStack clickedItem = event.getCurrentItem();

        // Ignore clicks on empty slots or items without metadata
        if (clickedItem == null || clickedItem.getType() == Material.AIR || clickedItem.getItemMeta() == null) {
            return;
        }

        PersistentDataContainer data = clickedItem.getItemMeta().getPersistentDataContainer();

        if (clickedGuiTitle.equals(mainGuiTitle)) {
            handleServerListClick(player, data);
        } else if (clickedGuiTitle.startsWith(actionGuiPrefix)) {
            handleActionGuiClick(player, data);
        }
    }

    private void handleServerListClick(Player player, PersistentDataContainer data) {
        String serverName = data.get(ServerActionUI.SERVER_NAME_KEY, PersistentDataType.STRING);
        String navAction = data.get(ServerListUI.ACTION_KEY, PersistentDataType.STRING);

        if (navAction != null) {
            if ("close".equals(navAction)) {
                player.closeInventory();
                return;
            }
            if ("next_page".equals(navAction) || "prev_page".equals(navAction)) {
                Integer page = data.get(ServerListUI.PAGE_KEY, PersistentDataType.INTEGER);
                if (page != null) {
                    List<GameServer> servers = plugin.getServerListUI().getCachedServersForPlayer(player);
                    if (!servers.isEmpty()) {
                        plugin.getServerListUI().open(player, servers, page);
                    } else {
                         // Fallback: refetch if cache is lost
                         player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, "GET_SERVERS".getBytes(StandardCharsets.UTF_8));
                    }
                }
                return;
            }
        }
        
        // If it's a server item, open the action UI for it
        if (serverName != null) {
            Optional<GameServer> serverOpt = plugin.getServerListUI().getServerByName(serverName);
            serverOpt.ifPresent(server -> {
                // Run on main thread to open GUI
                plugin.getServer().getScheduler().runTask(plugin, () -> ServerActionUI.open(player, server));
            });
        }
    }

    private void handleActionGuiClick(Player player, PersistentDataContainer data) {
        String action = data.get(ServerActionUI.ACTION_KEY, PersistentDataType.STRING);

        if ("back".equals(action)) {
            // Request a fresh server list to go back to the main menu
            player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, "GET_SERVERS".getBytes(StandardCharsets.UTF_8));
            return;
        }

        String serverName = data.get(ServerActionUI.SERVER_NAME_KEY, PersistentDataType.STRING);
        if (action != null && serverName != null) {
             handleAction(player, serverName, action);
             player.closeInventory();
        }
    }

    private void handleAction(Player player, String serverName, String action) {
        String message = "ACTION:" + action + ":" + serverName;
        player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, message.getBytes(StandardCharsets.UTF_8));
    }
}

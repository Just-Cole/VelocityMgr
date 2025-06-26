
package com.velocitymanager.spigot.listeners;

import com.velocitymanager.spigot.SpigotVManager;
import com.velocitymanager.spigot.model.GameServer;
import com.velocitymanager.spigot.ui.ServerActionUI;
import com.velocitymanager.spigot.ui.ServerListUI;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.TextComponent;
import net.kyori.adventure.text.format.NamedTextColor;
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
        
        Component titleComponent = event.getView().title();
        if (!(titleComponent instanceof TextComponent)) {
            return;
        }
        String clickedGuiTitle = ((TextComponent) titleComponent).content();

        if (!clickedGuiTitle.equals(mainGuiTitle) && !clickedGuiTitle.startsWith(actionGuiPrefix)) {
            return;
        }

        event.setCancelled(true);

        if (!(event.getWhoClicked() instanceof Player)) {
            return;
        }

        Player player = (Player) event.getWhoClicked();
        ItemStack clickedItem = event.getCurrentItem();

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
            if ("create_server".equals(navAction)) {
                player.closeInventory();
                player.sendMessage(Component.text("Please use the web dashboard to create a new server.", NamedTextColor.GREEN));
                return;
            }
            if ("next_page".equals(navAction) || "prev_page".equals(navAction)) {
                Integer page = data.get(ServerListUI.PAGE_KEY, PersistentDataType.INTEGER);
                if (page != null) {
                    List<GameServer> servers = plugin.getServerListUI().getCachedServersForPlayer(player);
                    if (!servers.isEmpty()) {
                        plugin.getServerListUI().open(player, servers, page);
                    } else {
                         player.sendPluginMessage(plugin, SpigotVManager.CHANNEL, "GET_SERVERS".getBytes(StandardCharsets.UTF_8));
                    }
                }
                return;
            }
        }
        
        if (serverName != null) {
            Optional<GameServer> serverOpt = plugin.getServerListUI().getServerByName(serverName);
            serverOpt.ifPresent(server -> {
                plugin.getServer().getScheduler().runTask(plugin, () -> ServerActionUI.open(player, server));
            });
        }
    }

    private void handleActionGuiClick(Player player, PersistentDataContainer data) {
        String action = data.get(ServerActionUI.ACTION_KEY, PersistentDataType.STRING);

        if ("back".equals(action)) {
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

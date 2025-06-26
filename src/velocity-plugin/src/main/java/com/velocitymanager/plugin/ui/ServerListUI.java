package com.velocitymanager.plugin.ui;

import com.velocitymanager.plugin.VelocityManagerPlugin;
import com.velocitymanager.plugin.model.GameServer;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.server.ServerInfo;
import com.velocitypowered.api.util.GameProfile;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import net.kyori.adventure.inventory.Inventory;
import net.kyori.adventure.inventory.InventoryType;
import net.kyori.adventure.item.ItemStack;
import net.kyori.adventure.item.ItemType;
import net.kyori.adventure.item.ItemTypes;
import net.kyori.adventure.item.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;

public class ServerListUI {

    private final VelocityManagerPlugin plugin;
    private final Player player;

    public ServerListUI(VelocityManagerPlugin plugin, Player player) {
        this.plugin = plugin;
        this.player = player;
    }

    public void open() {
        player.sendMessage(Component.text("Fetching server list...", NamedTextColor.GRAY));
        plugin.getApiService().fetchServers().thenAcceptAsync(servers -> {
            int size = (int) Math.ceil(servers.size() / 9.0) * 9;
            if (size == 0) size = 9;

            Inventory inventory = Inventory.builder()
                .type(InventoryType.ofSize(size))
                .title(Component.text("Velocity Manager - Servers"))
                .build();

            for (GameServer server : servers) {
                inventory.addItem(createServerItem(server));
            }

            player.openInventory(inventory, click -> {
                click.getInventory().close();
                if (click.getClickedItem().isPresent()) {
                    String serverId = click.getClickedItem().get().get(GameServer.SERVER_ID_KEY).orElse(null);
                    if (serverId != null) {
                        GameServer clickedServer = servers.stream().filter(s -> s.id().equals(serverId)).findFirst().orElse(null);
                        if(clickedServer != null) {
                            new ServerActionUI(plugin, player, clickedServer).open();
                        }
                    }
                }
            });
        }).exceptionally(ex -> {
            player.sendMessage(Component.text("Failed to fetch server list: " + ex.getMessage(), NamedTextColor.RED));
            plugin.getLogger().error("Failed to fetch server list", ex);
            return null;
        });
    }

    private ItemStack createServerItem(GameServer server) {
        ItemType material;
        List<Component> lore = new ArrayList<>();

        switch (server.status()) {
            case "Online":
                material = ItemTypes.LIME_STAINED_GLASS_PANE;
                lore.add(Component.text("Status: Online", NamedTextColor.GREEN));
                break;
            case "Offline":
                material = ItemTypes.RED_STAINED_GLASS_PANE;
                lore.add(Component.text("Status: Offline", NamedTextColor.RED));
                break;
            case "Starting":
            case "restarting":
            case "stopping":
                 material = ItemTypes.YELLOW_STAINED_GLASS_PANE;
                 lore.add(Component.text("Status: " + server.status(), NamedTextColor.YELLOW));
                 break;
            default:
                material = ItemTypes.GRAY_STAINED_GLASS_PANE;
                lore.add(Component.text("Status: Unknown", NamedTextColor.GRAY));
        }

        lore.add(Component.text(" "));
        lore.add(Component.text("Type: " + server.softwareType(), NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
        lore.add(Component.text("Version: " + server.serverVersion(), NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
        lore.add(Component.text("Address: " + server.ip() + ":" + server.port(), NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, false));
        lore.add(Component.text(" "));
        lore.add(Component.text("Click to manage", NamedTextColor.AQUA));
        
        return ItemStack.builder(material)
            .displayName(Component.text(server.name(), NamedTextColor.WHITE).decoration(TextDecoration.ITALIC, false))
            .lore(lore)
            .set(GameServer.SERVER_ID_KEY, server.id())
            .build();
    }
}

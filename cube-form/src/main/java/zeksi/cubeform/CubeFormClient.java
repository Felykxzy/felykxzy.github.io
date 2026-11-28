package zeksi.cubeform;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.util.RandomSource;
import org.joml.Vector3f;
import org.lwjgl.glfw.GLFW;

/** Мод «Cube Form»: превращает игрока в куб с частицами. Только клиентская часть. */
public class CubeFormClient implements ClientModInitializer {
    /** 0 = обычный игрок, 1 = полностью куб. */
    public static float progress = 0f, prevProgress = 0f;
    public static boolean cube = false;
    private static BlockState shape = Blocks.GOLD_BLOCK.defaultBlockState();
    private static KeyMapping key;

    public static BlockState shape() { return shape; }

    @Override
    public void onInitializeClient() {
        key = KeyBindingHelper.registerKeyBinding(new KeyMapping("key.cubeform.toggle", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_V, "key.categories.misc"));
        ClientCommandRegistrationCallback.EVENT.register((d, r) -> d.register(ClientCommandManager.literal("cube").executes(c -> { toggle(); return 1; })));
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            while (key.consumeClick()) toggle();
            tick(mc);
        });
    }

    public static void toggle() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;
        cube = !cube;
        if (cube) {
            ItemStack held = mc.player.getMainHandItem();
            if (held.getItem() instanceof BlockItem bi) shape = bi.getBlock().defaultBlockState();
            else shape = Blocks.GOLD_BLOCK.defaultBlockState();
        }
        mc.player.displayClientMessage(Component.literal(cube ? "Ты куб! (/cube или V чтобы вернуться)" : "Ты снова человек"), true);
        burst(mc, cube);
    }

    private static int colorOf(BlockState st) {
        int c = st.getBlock().defaultMapColor().col;
        return c == 0 ? 0xFFD24A : c;
    }

    /** Взрыв частиц при превращении: наружу при входе в куб, внутрь при возврате. */
    private static void burst(Minecraft mc, boolean toCube) {
        RandomSource rnd = mc.level.random;
        double x = mc.player.getX(), y = mc.player.getY() + 0.9, z = mc.player.getZ();
        int col = colorOf(shape);
        Vector3f rgb = new Vector3f(((col >> 16) & 255) / 255f, ((col >> 8) & 255) / 255f, (col & 255) / 255f);
        for (int i = 0; i < 140; i++) {
            double ax = rnd.nextGaussian(), ay = rnd.nextGaussian(), az = rnd.nextGaussian();
            double len = Math.max(0.001, Math.sqrt(ax * ax + ay * ay + az * az));
            ax /= len; ay /= len; az /= len;
            double sp = 0.05 + rnd.nextDouble() * 0.25;
            ParticleOptions p = (i % 3 == 0) ? ParticleTypes.END_ROD : new DustParticleOptions(rgb, 1.0f + rnd.nextFloat());
            if (toCube) mc.level.addParticle(p, x + ax * 0.3, y + ay * 0.5, z + az * 0.3, ax * sp, ay * sp, az * sp);
            else mc.level.addParticle(p, x + ax * 1.6, y + ay * 1.6, z + az * 1.6, -ax * sp * 0.6, -ay * sp * 0.6, -az * sp * 0.6);
        }
    }

    private static void tick(Minecraft mc) {
        prevProgress = progress;
        float target = cube ? 1f : 0f;
        if (progress < target) progress = Math.min(target, progress + 0.1f);
        else if (progress > target) progress = Math.max(target, progress - 0.1f);
        if (mc.player == null || mc.level == null) { cube = false; progress = prevProgress = 0f; return; }
        // лёгкие частицы вокруг куба
        if (progress >= 1f && mc.level.getGameTime() % 2 == 0) {
            RandomSource rnd = mc.level.random;
            double a = mc.level.getGameTime() * 0.2;
            double x = mc.player.getX() + Math.cos(a) * 0.8, z = mc.player.getZ() + Math.sin(a) * 0.8;
            mc.level.addParticle(ParticleTypes.END_ROD, x, mc.player.getY() + 0.1 + rnd.nextDouble() * 0.9, z, 0, 0.01, 0);
        }
    }
}

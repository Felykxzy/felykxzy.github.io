package zeksi.cubeform;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.vehicle.Boat;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import org.joml.Vector3f;
import org.lwjgl.glfw.GLFW;

/**
 * Cube Form: игрок сам превращается.
 * В воде: лодка. На ходу: обычный игрок. Стоишь на месте: блок рядом (куда смотришь, иначе под ногами).
 * Только клиентская часть: превращение видишь ты.
 */
public class CubeFormClient implements ClientModInitializer {
    public static final int PLAYER = 0, BLOCK = 1, BOAT = 2;

    /** Включён ли мод (команда /cube или клавиша V). */
    public static boolean enabled = true;
    /** Какая форма сейчас показана и какая нужна. */
    public static int shown = PLAYER, target = PLAYER;
    /** Размер показанной формы 0..1 (для плавного сжатия и роста). */
    public static float scale = 1f, prevScale = 1f;
    private static BlockState shape = Blocks.GOLD_BLOCK.defaultBlockState();
    private static BlockState wantShape = shape;
    private static int still = 0;
    private static KeyMapping key;
    private static Boat boat;

    public static BlockState shape() { return shape; }

    public static Boat boat(Minecraft mc) {
        if (boat == null || boat.level() != mc.level) {
            boat = new Boat(EntityType.BOAT, mc.level);
            boat.setVariant(Boat.Type.OAK);
        }
        return boat;
    }

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
        enabled = !enabled;
        if (mc.player != null) mc.player.displayClientMessage(Component.literal(enabled ? "Cube Form: включён (сам превращаешься)" : "Cube Form: выключен"), true);
    }

    private static boolean fullBlock(Minecraft mc, BlockPos p) {
        BlockState st = mc.level.getBlockState(p);
        return !st.isAir() && st.isCollisionShapeFullBlock(mc.level, p);
    }

    /** Выбрать блок: тот, на который смотришь (до 5 клеток), иначе под ногами. */
    private static BlockState pickBlock(Minecraft mc) {
        if (mc.hitResult instanceof BlockHitResult br && br.getType() == HitResult.Type.BLOCK
                && mc.player.getEyePosition().distanceTo(br.getLocation()) <= 5.0 && fullBlock(mc, br.getBlockPos())) {
            return mc.level.getBlockState(br.getBlockPos());
        }
        BlockPos below = BlockPos.containing(mc.player.getX(), mc.player.getY() - 0.5, mc.player.getZ());
        if (fullBlock(mc, below)) return mc.level.getBlockState(below);
        return Blocks.GOLD_BLOCK.defaultBlockState();
    }

    private static int colorOf(BlockState st) {
        int c = st.getBlock().defaultMapColor().col;
        return c == 0 ? 0xFFD24A : c;
    }

    /** Взрыв частиц: наружу, когда игрок становится предметом, внутрь, когда возвращается. */
    private static void burst(Minecraft mc, boolean outward, int col) {
        RandomSource rnd = mc.level.random;
        double x = mc.player.getX(), y = mc.player.getY() + 0.9, z = mc.player.getZ();
        Vector3f rgb = new Vector3f(((col >> 16) & 255) / 255f, ((col >> 8) & 255) / 255f, (col & 255) / 255f);
        for (int i = 0; i < 120; i++) {
            double ax = rnd.nextGaussian(), ay = rnd.nextGaussian(), az = rnd.nextGaussian();
            double len = Math.max(0.001, Math.sqrt(ax * ax + ay * ay + az * az));
            ax /= len; ay /= len; az /= len;
            double sp = 0.05 + rnd.nextDouble() * 0.22;
            ParticleOptions p = (i % 3 == 0) ? ParticleTypes.END_ROD : new DustParticleOptions(rgb, 1.0f + rnd.nextFloat());
            if (outward) mc.level.addParticle(p, x + ax * 0.3, y + ay * 0.5, z + az * 0.3, ax * sp, ay * sp, az * sp);
            else mc.level.addParticle(p, x + ax * 1.5, y + ay * 1.5, z + az * 1.5, -ax * sp * 0.6, -ay * sp * 0.6, -az * sp * 0.6);
        }
    }

    private static void tick(Minecraft mc) {
        prevScale = scale;
        if (mc.player == null || mc.level == null) { shown = target = PLAYER; scale = prevScale = 1f; still = 0; return; }

        // 1. что нужно показать сейчас
        int want = PLAYER;
        if (enabled) {
            double dx = mc.player.getX() - mc.player.xo, dz = mc.player.getZ() - mc.player.zo;
            boolean moving = dx * dx + dz * dz > 0.0004;
            if (mc.player.isInWater()) { want = BOAT; still = 0; }
            else if (moving || !mc.player.onGround() || mc.player.isPassenger() || mc.player.isSleeping()) { still = 0; }
            else { still++; if (still >= 12) want = BLOCK; }
        } else still = 0;

        // 2. выбрать блок один раз, когда начинаем становиться блоком
        if (want == BLOCK && target != BLOCK) wantShape = pickBlock(mc);
        target = want;

        // 3. плавное сжатие старой формы и рост новой
        if (shown != target) {
            scale -= 0.25f;
            if (scale <= 0f) {
                boolean toItem = target != PLAYER;
                shown = target;
                if (shown == BLOCK) shape = wantShape;
                burst(mc, toItem, shown == BOAT ? 0x9A6B3A : colorOf(shown == BLOCK ? shape : wantShape));
                scale = 0f;
            }
        } else if (scale < 1f) {
            scale = Math.min(1f, scale + 0.25f);
        }

        // 4. лёгкие частицы вокруг, пока ты блок
        if (shown == BLOCK && scale >= 1f && mc.level.getGameTime() % 2 == 0) {
            RandomSource rnd = mc.level.random;
            double a = mc.level.getGameTime() * 0.2;
            mc.level.addParticle(ParticleTypes.END_ROD, mc.player.getX() + Math.cos(a) * 0.8, mc.player.getY() + 0.1 + rnd.nextDouble() * 0.9, mc.player.getZ() + Math.sin(a) * 0.8, 0, 0.01, 0);
        }
    }
}

package zeksi.cubeform.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import zeksi.cubeform.CubeFormClient;

@Mixin(PlayerRenderer.class)
public class PlayerRendererMixin {
    private static boolean cubeform$pushed = false;

    @Inject(method = "render(Lnet/minecraft/client/player/AbstractClientPlayer;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", at = @At("HEAD"), cancellable = true)
    private void cubeform$render(AbstractClientPlayer player, float yaw, float partial, PoseStack pose, MultiBufferSource buf, int light, CallbackInfo ci) {
        cubeform$pushed = false;
        Minecraft mc = Minecraft.getInstance();
        if (player != mc.player) return;
        float s = CubeFormClient.prevScale + (CubeFormClient.scale - CubeFormClient.prevScale) * partial;
        int form = CubeFormClient.shown;

        if (form == CubeFormClient.PLAYER) {
            if (s >= 1f) return;
            // игрок сжимается или растёт
            float k = Math.max(0.02f, s);
            pose.pushPose();
            pose.scale(k, k, k);
            cubeform$pushed = true;
            return;
        }

        ci.cancel();
        float k = Math.max(0.02f, s);
        pose.pushPose();
        if (form == CubeFormClient.BLOCK) {
            float size = 0.9f * k;
            pose.translate(0.0, 0.05 + (0.9 - size) * 0.5, 0.0);
            pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(-player.yBodyRot));
            pose.scale(size, size, size);
            pose.translate(-0.5, 0.0, -0.5);
            mc.getBlockRenderer().renderSingleBlock(CubeFormClient.shape(), pose, buf, light, OverlayTexture.NO_OVERLAY);
        } else {
            pose.translate(0.0, 0.1 * k + Math.sin((player.tickCount + partial) * 0.15) * 0.02, 0.0);
            pose.scale(k, k, k);
            mc.getEntityRenderDispatcher().render(CubeFormClient.boat(mc), 0.0, 0.0, 0.0, player.yBodyRot, partial, pose, buf, light);
        }
        pose.popPose();
    }

    @Inject(method = "render(Lnet/minecraft/client/player/AbstractClientPlayer;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", at = @At("RETURN"))
    private void cubeform$after(AbstractClientPlayer player, float yaw, float partial, PoseStack pose, MultiBufferSource buf, int light, CallbackInfo ci) {
        if (cubeform$pushed) { pose.popPose(); cubeform$pushed = false; }
    }
}

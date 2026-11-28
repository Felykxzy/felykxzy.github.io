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
    @Inject(method = "render(Lnet/minecraft/client/player/AbstractClientPlayer;FFLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", at = @At("HEAD"), cancellable = true)
    private void cubeform$render(AbstractClientPlayer player, float yaw, float partial, PoseStack pose, MultiBufferSource buf, int light, CallbackInfo ci) {
        if (player != Minecraft.getInstance().player) return;
        float p = CubeFormClient.prevProgress + (CubeFormClient.progress - CubeFormClient.prevProgress) * partial;
        if (p <= 0f) return;
        ci.cancel();
        // 0..0.5: игрок сжимается в точку (рисуется как мелкий куб-игрок), 0.5..1: куб вырастает
        float s = p < 0.5f ? 1f - p * 2f : (p - 0.5f) * 2f;
        float size = 0.9f * Math.max(0.02f, s) ;
        pose.pushPose();
        pose.translate(0.0, 0.05 + (0.9 - size) * 0.5 + Math.sin((player.tickCount + partial) * 0.1) * 0.03 * p, 0.0);
        pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(-player.yBodyRot));
        pose.scale(size, size, size);
        pose.translate(-0.5, 0.0, -0.5);
        Minecraft.getInstance().getBlockRenderer().renderSingleBlock(CubeFormClient.shape(), pose, buf, light, OverlayTexture.NO_OVERLAY);
        pose.popPose();
    }
}

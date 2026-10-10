"""Bounded CPU smoke: fp16 frozen storage, fp32 linear arithmetic.

Older Intel CPUs have no native fp16 GEMM. Keep the base weights compact in RAM
and cast one frozen layer at a time for BLAS computation. Backward saves the
fp16 weight, not an additional full-model fp32 copy. Adapter layers are untouched.
This is unnecessary on the Kaggle GPU and is never used there.
"""
import types


def optimise_frozen_linears(model):
    import torch
    import torch.nn.functional as functional

    class FrozenLinear(torch.autograd.Function):
        @staticmethod
        def forward(ctx, inputs, weight, bias):
            ctx.save_for_backward(weight)
            ctx.input_dtype = inputs.dtype
            return functional.linear(inputs.float(), weight.float(), None if bias is None else bias.float()).to(inputs.dtype)

        @staticmethod
        def backward(ctx, gradient):
            weight, = ctx.saved_tensors
            result = gradient.float().matmul(weight.float()).to(ctx.input_dtype) if ctx.needs_input_grad[0] else None
            return result, None, None

    def forward(self, inputs):
        return FrozenLinear.apply(inputs, self.weight, self.bias)

    count = 0
    for module in model.modules():
        if isinstance(module, torch.nn.Linear) and not module.weight.requires_grad and (module.bias is None or not module.bias.requires_grad):
            module.forward = types.MethodType(forward, module)
            count += 1
    return count

// WebGPU setup
async function initWebGPU() {
    if (!navigator.gpu) {
        console.error("WebGPU is not supported on this browser.");
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const context = canvas.getContext("webgpu");

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });

    // Create shader
    const shaderCode = `
        struct Uniforms {
            iTime: f32,
            padding: f32,  // Padding for 16-byte alignment
            iResolution: vec2<f32>,
        };
        
        @group(0) @binding(0) var<uniform> u: Uniforms;
        
        struct VertexOut {
            @builtin(position) Position: vec4<f32>,
            @location(0) fragUV: vec2<f32>,
        };
        
        @vertex
        fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
            var positions = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(3.0, -1.0),
                vec2<f32>(-1.0, 3.0)
            );
            let pos = positions[vertexIndex];
            var output: VertexOut;
            output.Position = vec4<f32>(pos, 0.0, 1.0);
            output.fragUV = (pos + vec2<f32>(1.0, 1.0)) * 0.5;
            return output;
        }
        
        fn random(t: f32) -> f32 {
            return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
        }
        
        @fragment
        fn fs_main(@location(0) fragUV: vec2<f32>) -> @location(0) vec4<f32> {
            let uv = fragUV;
            let space = (uv * 2.0 - vec2<f32>(1.0)) * 5.0;
            let horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
            let verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);
            
            let color = vec4<f32>(0.25, 0.5, 1.0, 1.0);
            var lines = vec4<f32>(0.0);
            
            for (var l: i32 = 0; l < 16; l = l + 1) {
                let normalizedLineIndex = f32(l) / 16.0;
                let offsetTime = u.iTime * 0.2;
                let offsetPosition = f32(l) + space.x * 0.5;
                let rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
                let halfWidth = mix(0.02, 0.5, rand * horizontalFade) / 2.0;
                let offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(0.6, 2.0, horizontalFade);
                let linePosition = random(space.x * 0.2 + u.iTime * 1.0) * horizontalFade + offset;
                let line = smoothstep(halfWidth, 0.0, abs(space.y - linePosition));
                lines += line * color * rand;
            }
            return lines * verticalFade;
        }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    // Pipeline setup
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
    });

    // **Fix: Increase buffer size to 16 bytes (alignment issue)**
    const uniformBuffer = device.createBuffer({
        size: 16, // Fix: Must be at least 16 bytes for correct alignment
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    function frame(time) {
        const resolution = new Float32Array([canvas.width, canvas.height]);
        const timeData = new Float32Array([time * 0.001, 0]); // Fix: Extra padding for alignment
        const uniformData = new Float32Array([...timeData, ...resolution]);

        // Fix: Write entire 16-byte aligned buffer at once
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: "clear",
                storeOp: "store",
                clearValue: [0.0, 0.0, 0.0, 1.0],
            }],
        });
        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);
        renderPass.draw(3);
        renderPass.end();
        device.queue.submit([commandEncoder.finish()]);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

initWebGPU();

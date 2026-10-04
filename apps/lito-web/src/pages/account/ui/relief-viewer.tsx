import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";

type ReliefData = {
  nodes: Array<{ x: number; y: number; z: number }>;
  cells: number[][];
};

function RealReliefMesh({
  relief,
  reduceMotion,
}: {
  relief: ReliefData;
  reduceMotion: boolean;
}) {
  const group = useRef<{ rotation: { y: number } }>(null);
  const { geometry, wireframe } = useMemo(() => {
    const bounds = relief.nodes.reduce(
      (result, node) => ({
        minX: Math.min(result.minX, node.x),
        maxX: Math.max(result.maxX, node.x),
        minY: Math.min(result.minY, node.y),
        maxY: Math.max(result.maxY, node.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );
    const { minX, maxX, minY, maxY } = bounds;
    const maxDepth = relief.nodes.reduce(
      (maximum, node) => Math.max(maximum, Math.max(0, node.z)),
      1
    );
    // Усиливаем вертикальный масштаб только для визуализации. Исходные глубины
    // остаются в данных и используются для раскраски вершин.
    const verticalScale = 4.8 / maxDepth;
    const positions = new Float32Array(relief.nodes.length * 3);
    const colors = new Float32Array(relief.nodes.length * 3);
    relief.nodes.forEach((node, index) => {
      const depth = Math.max(0, node.z);
      positions[index * 3] = ((node.x - minX) / (maxX - minX) - 0.5) * 8;
      positions[index * 3 + 1] = -depth * verticalScale;
      positions[index * 3 + 2] = ((node.y - minY) / (maxY - minY) - 0.5) * 5.4;
      const color = new THREE.Color().setHSL(
        0.54 - Math.min(depth / maxDepth, 1) * 0.18,
        0.88,
        0.42 + Math.min(depth / maxDepth, 1) * 0.2
      );
      colors.set([color.r, color.g, color.b], index * 3);
    });
    const indices = new Uint32Array(relief.cells.flat());
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    result.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    result.setIndex(new THREE.BufferAttribute(indices, 1));
    result.computeVertexNormals();
    return { geometry: result, wireframe: new THREE.WireframeGeometry(result) };
  }, [relief.cells, relief.nodes]);
  useFrame(({ clock }) => {
    if (group.current && !reduceMotion)
      group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.1) * 0.04;
  });
  return (
    <group ref={group} rotation={[-0.92, 0, 0]} position={[0, 0.55, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          vertexColors
          roughness={0.52}
          metalness={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={wireframe}>
        <lineBasicMaterial color="#d2f8ff" transparent opacity={0.32} />
      </lineSegments>
    </group>
  );
}

export function ReliefViewer() {
  const [relief, setRelief] = useState<ReliefData | null>(null);
  const reduceMotion = useReducedMotion() ?? false;
  useEffect(() => {
    fetch("/data/black-sea-relief.json")
      .then((response) => response.json() as Promise<ReliefData>)
      .then(setRelief);
  }, []);
  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-xl bg-[#06151e] sm:h-[460px]">
      {relief ? (
        <Canvas camera={{ position: [0, 4.2, 7.2], fov: 42 }} dpr={[1, 1.5]}>
          <color attach="background" args={["#06151e"]} />
          <ambientLight intensity={1.25} />
          <directionalLight
            position={[-4, 7, 5]}
            intensity={4.5}
            color="#d8fbff"
          />
          <directionalLight
            position={[4, 2, -3]}
            intensity={2.2}
            color="#168aad"
          />
          <RealReliefMesh relief={relief} reduceMotion={reduceMotion} />
          <OrbitControls
            enablePan={false}
            minDistance={4}
            maxDistance={12}
            target={[0, -0.8, 0]}
            autoRotate={!reduceMotion}
            autoRotateSpeed={0.25}
          />
        </Canvas>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-cyan-200">
          Загрузка сетки 191 766 узлов…
        </div>
      )}
    </div>
  );
}

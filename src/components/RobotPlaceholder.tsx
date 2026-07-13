import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, Mesh, MathUtils } from 'three';
import { Box, Cylinder, Sphere, RoundedBox, Plane } from '@react-three/drei';
import { RobotState, Emotion } from '../hooks/useRobotState';

export default function RobotPlaceholder({ robotState, emotion = 'default', ledColor = '#22d3ee' }: { robotState: RobotState, emotion?: Emotion, ledColor?: string }) {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);

  // Face animation refs
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  const mouthRef = useRef<Mesh>(null);

  useFrame((state) => {
    // Head look around slightly when idle or thinking
    if (headRef.current) {
      if (robotState === 'idle') {
        headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, Math.sin(state.clock.elapsedTime * 0.5) * 0.1, 0.1);
        headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, Math.cos(state.clock.elapsedTime * 0.7) * 0.05, 0.1);
      } else if (robotState === 'listening') {
        headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, 0, 0.1);
        headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, -0.1, 0.1); // Look slightly up/forward
      } else if (robotState === 'thinking') {
        headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, 0.3, 0.1); // Look up and away
        headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, -0.2, 0.1);
      } else if (robotState === 'talking') {
        headRef.current.rotation.y = MathUtils.lerp(headRef.current.rotation.y, Math.sin(state.clock.elapsedTime * 2) * 0.05, 0.1);
        headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, 0, 0.1);
      }
    }

    // Face animations
    if (leftEyeRef.current && rightEyeRef.current && mouthRef.current) {
      const time = state.clock.elapsedTime;
      
      // Blinking
      const blink = Math.sin(time * 5) > 0.95 ? 0.1 : 1;
      
      // Target values for emotions
      let targetEyeScaleY = blink;
      let targetLeftEyeRotZ = 0;
      let targetRightEyeRotZ = 0;
      let targetMouthScaleX = 1;
      let targetMouthScaleY = 0.5;
      let targetMouthPosY = -0.05;
      
      if (emotion === 'happy') {
        targetEyeScaleY = blink * 0.3; // Squinting
        targetMouthScaleX = 1.2;
        targetMouthScaleY = 0.8;
        targetMouthPosY = -0.04; // Mouth slightly higher
      } else if (emotion === 'angry') {
        targetEyeScaleY = blink * 0.6;
        targetLeftEyeRotZ = -0.3;
        targetRightEyeRotZ = 0.3;
        targetMouthScaleX = 0.6;
        targetMouthScaleY = 0.2;
      } else if (emotion === 'sad') {
        targetEyeScaleY = blink * 0.7;
        targetLeftEyeRotZ = 0.3;
        targetRightEyeRotZ = -0.3;
        targetMouthScaleX = 0.5;
        targetMouthScaleY = 0.2;
        targetMouthPosY = -0.06;
      } else if (emotion === 'thinking' || robotState === 'thinking') {
        targetEyeScaleY = blink * 0.8;
        targetLeftEyeRotZ = 0;
        targetRightEyeRotZ = 0;
        targetMouthScaleX = 0.3;
        targetMouthScaleY = 0.2;
      } else if (robotState === 'listening') {
        targetEyeScaleY = 1.2; // Wide eyes
        targetMouthScaleX = 0.5;
        targetMouthScaleY = 0.5;
      }
      
      // Talking overrides mouth Y scale
      if (robotState === 'talking') {
        const talk = Math.abs(Math.sin(time * 15)) * 0.8 + 0.2;
        targetMouthScaleY = emotion === 'happy' ? talk * 1.2 : talk;
        if (emotion === 'default') {
           targetMouthScaleX = 0.8;
        }
      }
      
      // Apply lerping for smooth transitions
      leftEyeRef.current.scale.y = MathUtils.lerp(leftEyeRef.current.scale.y, targetEyeScaleY, 0.2);
      rightEyeRef.current.scale.y = MathUtils.lerp(rightEyeRef.current.scale.y, targetEyeScaleY, 0.2);
      
      leftEyeRef.current.rotation.z = MathUtils.lerp(leftEyeRef.current.rotation.z, targetLeftEyeRotZ, 0.2);
      rightEyeRef.current.rotation.z = MathUtils.lerp(rightEyeRef.current.rotation.z, targetRightEyeRotZ, 0.2);
      
      mouthRef.current.scale.x = MathUtils.lerp(mouthRef.current.scale.x, targetMouthScaleX, 0.2);
      mouthRef.current.scale.y = MathUtils.lerp(mouthRef.current.scale.y, targetMouthScaleY, 0.5); // Faster mouth movement
      mouthRef.current.position.y = MathUtils.lerp(mouthRef.current.position.y, targetMouthPosY, 0.2);
    }
  });

  return (
    <group position={[0, -0.6, 0]} ref={groupRef}>
      {/* BASE */}
      {/* Lower Base (Black) */}
      <RoundedBox args={[0.5, 0.15, 0.4]} position={[0, 0.075, 0]} radius={0.02} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#111" roughness={0.8} />
      </RoundedBox>
      {/* Upper Base (White) */}
      <RoundedBox args={[0.45, 0.12, 0.35]} position={[0, 0.18, 0]} radius={0.04} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#e2e4e9" roughness={0.3} metalness={0.1} />
      </RoundedBox>
      
      {/* WHEELS */}
      {/* Left Wheel */}
      <Cylinder args={[0.12, 0.12, 0.08, 32]} position={[-0.27, 0.12, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
        <meshStandardMaterial color="#050505" roughness={0.9} />
      </Cylinder>
      {/* Right Wheel */}
      <Cylinder args={[0.12, 0.12, 0.08, 32]} position={[0.27, 0.12, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]} castShadow>
        <meshStandardMaterial color="#050505" roughness={0.9} />
      </Cylinder>

      {/* TORSO */}
      <group position={[0, 0.4, 0]}>
        {/* Main Torso */}
        <RoundedBox args={[0.3, 0.35, 0.25]} position={[0, 0, 0]} radius={0.03} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e4e9" roughness={0.3} metalness={0.1} />
        </RoundedBox>
        {/* Torso Detail Line */}
        <Box args={[0.25, 0.02, 0.26]} position={[0, -0.05, 0]}>
          <meshStandardMaterial color="#111" />
        </Box>
        <Box args={[0.15, 0.1, 0.26]} position={[0, 0.08, 0]}>
          <meshStandardMaterial color="#111" />
        </Box>
        {/* Status LED */}
        <Box args={[0.02, 0.1, 0.02]} position={[-0.14, 0.05, 0.12]}>
          <meshBasicMaterial color={ledColor} />
        </Box>
      </group>

      {/* ARM (Left side relative to robot -> user's right side, but let's place it on -X which is user's left to match image) */}
      <group position={[-0.18, 0.45, 0]} rotation={[0, 0, Math.PI / 8]}>
        {/* Shoulder Joint */}
        <Cylinder args={[0.04, 0.04, 0.06, 16]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial color="#111" />
        </Cylinder>
        {/* Upper Arm */}
        <Box args={[0.04, 0.2, 0.04]} position={[-0.04, -0.1, 0]} rotation={[0, 0, -Math.PI / 8]}>
          <meshStandardMaterial color="#111" />
        </Box>
        {/* Elbow Joint */}
        <Cylinder args={[0.03, 0.03, 0.05, 16]} position={[-0.08, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#333" />
        </Cylinder>
        {/* Forearm */}
        <Box args={[0.03, 0.15, 0.03]} position={[-0.08, -0.28, 0.05]} rotation={[Math.PI / 4, 0, 0]}>
          <meshStandardMaterial color="#111" />
        </Box>
        {/* Gripper */}
        <group position={[-0.08, -0.34, 0.1]}>
          <Box args={[0.06, 0.02, 0.02]}>
            <meshStandardMaterial color="#333" />
          </Box>
          <Box args={[0.01, 0.06, 0.02]} position={[-0.025, -0.03, 0]}>
             <meshStandardMaterial color="#111" />
          </Box>
          <Box args={[0.01, 0.06, 0.02]} position={[0.025, -0.03, 0]}>
             <meshStandardMaterial color="#111" />
          </Box>
        </group>
      </group>

      {/* NECK */}
      <group position={[0, 0.6, 0]}>
        <Cylinder args={[0.03, 0.03, 0.08, 16]}>
          <meshStandardMaterial color="#111" />
        </Cylinder>
        {/* Pan/Tilt Servo Base */}
        <Box args={[0.06, 0.04, 0.05]} position={[0, 0.05, 0]}>
          <meshStandardMaterial color="#333" />
        </Box>
      </group>

      {/* HEAD */}
      <group ref={headRef} position={[0, 0.75, 0]}>
        {/* Head Casing */}
        <RoundedBox args={[0.45, 0.3, 0.2]} radius={0.03} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color="#e2e4e9" roughness={0.3} metalness={0.1} />
        </RoundedBox>
        
        {/* Screen Bezel */}
        <RoundedBox args={[0.42, 0.27, 0.02]} position={[0, 0, 0.1]} radius={0.01} smoothness={4}>
          <meshStandardMaterial color="#111" />
        </RoundedBox>

        {/* Screen */}
        <Plane args={[0.4, 0.25]} position={[0, 0, 0.112]}>
          <meshBasicMaterial color="#050505" />
        </Plane>

        {/* Face Elements */}
        <group position={[0, 0, 0.115]}>
          {/* Left Eye */}
          <mesh ref={leftEyeRef} position={[-0.08, 0.03, 0]}>
            <circleGeometry args={[0.03, 32]} />
            <meshBasicMaterial color={ledColor} />
          </mesh>
          {/* Right Eye */}
          <mesh ref={rightEyeRef} position={[0.08, 0.03, 0]}>
            <circleGeometry args={[0.03, 32]} />
            <meshBasicMaterial color={ledColor} />
          </mesh>
          {/* Mouth */}
          <mesh ref={mouthRef} position={[0, -0.05, 0]}>
            <planeGeometry args={[0.06, 0.02]} />
            <meshBasicMaterial color={ledColor} />
          </mesh>
        </group>

        {/* Antenna */}
        <group position={[-0.15, 0.15, 0]}>
          <Cylinder args={[0.005, 0.005, 0.1, 8]} position={[0, 0.05, 0]}>
            <meshStandardMaterial color="#111" />
          </Cylinder>
          <Sphere args={[0.015, 16, 16]} position={[0, 0.1, 0]}>
            <meshStandardMaterial color="#333" />
          </Sphere>
        </group>
        {/* Camera (Small dot on top middle bezel) */}
        <mesh position={[0, 0.11, 0.115]}>
          <circleGeometry args={[0.01, 16]} />
          <meshBasicMaterial color="#444" />
        </mesh>
      </group>
    </group>
  );
}
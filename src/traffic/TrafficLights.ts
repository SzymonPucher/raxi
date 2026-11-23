import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { MapDefinition } from '../world/mapData';

type LightPhase = 'ns_green' | 'ns_yellow' | 'ew_green' | 'ew_yellow';

interface IntersectionLight {
  nodeId: string;
  x: number;
  y: number;
  z: number;
  offset: number;
  nsBulbMat: THREE.MeshBasicMaterial;
  ewBulbMat: THREE.MeshBasicMaterial;
}

/**
 * 4-phase intersection traffic lights (§7.1, §9.5).
 */
export class TrafficLights {
  public readonly group = new THREE.Group();
  private readonly lights = new Map<string, IntersectionLight>();
  private elapsed = 0;

  private readonly greenDur = BALANCE.trafficLightGreenDuration;
  private readonly yellowDur = BALANCE.trafficLightYellowDuration;
  private readonly cycleDur = (BALANCE.trafficLightGreenDuration + BALANCE.trafficLightYellowDuration) * 2;

  constructor(map: MapDefinition) {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.0, 6);
    poleGeo.translate(0, 3.0, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
    const boxGeo = new THREE.BoxGeometry(0.65, 1.3, 0.65);
    const bulbGeo = new THREE.SphereGeometry(0.28, 6, 6);

    let idx = 0;
    for (const node of map.graph.nodes.values()) {
      if (!node.hasTrafficLight) continue;
      const offset = (idx * 5.3) % this.cycleDur;
      idx++;

      const nsBulbMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
      const ewBulbMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });

      // Place two diagonal corner poles per signalized intersection
      for (const [ox, oz] of [
        [9.5, 9.5],
        [-9.5, -9.5],
      ]) {
        const g = new THREE.Group();
        g.position.set(node.x + ox, node.y, node.z + oz);

        const pole = new THREE.Mesh(poleGeo, poleMat);
        g.add(pole);

        const head = new THREE.Mesh(boxGeo, poleMat);
        head.position.y = 5.8;
        g.add(head);

        // N-S facing lamps (+Z / -Z)
        const nsBulb1 = new THREE.Mesh(bulbGeo, nsBulbMat);
        nsBulb1.position.set(0, 5.8, 0.36);
        const nsBulb2 = new THREE.Mesh(bulbGeo, nsBulbMat);
        nsBulb2.position.set(0, 5.8, -0.36);
        g.add(nsBulb1, nsBulb2);

        // E-W facing lamps (+X / -X)
        const ewBulb1 = new THREE.Mesh(bulbGeo, ewBulbMat);
        ewBulb1.position.set(0.36, 5.8, 0);
        const ewBulb2 = new THREE.Mesh(bulbGeo, ewBulbMat);
        ewBulb2.position.set(-0.36, 5.8, 0);
        g.add(ewBulb1, ewBulb2);

        this.group.add(g);
      }

      this.lights.set(node.id, {
        nodeId: node.id,
        x: node.x,
        y: node.y,
        z: node.z,
        offset,
        nsBulbMat,
        ewBulbMat,
      });
    }
  }

  reset(): void {
    this.elapsed = 0;
    this.updateVisuals();
  }

  getPhase(nodeId: string): LightPhase {
    const light = this.lights.get(nodeId);
    if (!light) return 'ns_green';
    const t = (this.elapsed + light.offset) % this.cycleDur;
    if (t < this.greenDur) return 'ns_green';
    if (t < this.greenDur + this.yellowDur) return 'ns_yellow';
    if (t < this.greenDur * 2 + this.yellowDur) return 'ew_green';
    return 'ew_yellow';
  }

  /** Returns true if traffic traveling along (dirX, dirZ) has a RED light at `nodeId`. */
  isRedForDirection(nodeId: string, dirX: number, dirZ: number): boolean {
    if (!this.lights.has(nodeId)) return false;
    const phase = this.getPhase(nodeId);
    const movingNS = Math.abs(dirZ) >= Math.abs(dirX);
    if (movingNS) {
      return phase === 'ew_green' || phase === 'ew_yellow';
    }
    return phase === 'ns_green' || phase === 'ns_yellow';
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.updateVisuals();
  }

  private updateVisuals(): void {
    for (const light of this.lights.values()) {
      const phase = this.getPhase(light.nodeId);
      const nsHex =
        phase === 'ns_green' ? 0x00e676 : phase === 'ns_yellow' ? 0xffea00 : 0xff1744;
      const ewHex =
        phase === 'ew_green' ? 0x00e676 : phase === 'ew_yellow' ? 0xffea00 : 0xff1744;
      light.nsBulbMat.color.setHex(nsHex);
      light.ewBulbMat.color.setHex(ewHex);
    }
  }
}

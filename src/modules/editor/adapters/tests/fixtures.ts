// src/modules/editor/adapters/tests/fixtures.ts
// Fixtures de prueba para los 10 casos requeridos en Fase 2.

import type { DiagramModel, ClassNode, LinkEdge, RelationKind } from '@/modules/editor/services/canvas.engine'

/* =========================================================================
 * CASO 1 — Clase simple
 * ========================================================================= */
export const case1_simpleClass: DiagramModel = {
  classes: {
    'cls-1': {
      id: 'cls-1',
      x: 100,
      y: 100,
      w: 170,
      h: 100,
      name: 'Persona',
      attributes: ['+ id: bigint', '+ nombre: string'],
      methods: [],
    },
  },
  links: {},
}

/* =========================================================================
 * CASO 2 — Atributo con multiplicidad
 * ========================================================================= */
export const case2_attrMultiplicity: DiagramModel = {
  classes: {
    'cls-2': {
      id: 'cls-2',
      x: 100,
      y: 100,
      w: 170,
      h: 100,
      name: 'Pedido',
      attributes: ['+ items: string [0..*]'],
      methods: [],
    },
  },
  links: {},
}

/* =========================================================================
 * CASO 3 — Método con parámetros
 * ========================================================================= */
export const case3_methodParams: DiagramModel = {
  classes: {
    'cls-3': {
      id: 'cls-3',
      x: 100,
      y: 100,
      w: 170,
      h: 100,
      name: 'AuthService',
      attributes: [],
      methods: ['+ login(u: string, p: string): boolean'],
    },
  },
  links: {},
}

/* =========================================================================
 * CASO 4 — Herencia (Empleado → Persona)
 * ========================================================================= */
export const case4_generalization: DiagramModel = {
  classes: {
    'cls-persona': {
      id: 'cls-persona',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Persona',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-empleado': {
      id: 'cls-empleado',
      x: 100,
      y: 250,
      w: 170,
      h: 80,
      name: 'Empleado',
      attributes: ['+ salario: decimal'],
      methods: [],
    },
  },
  links: {
    'link-gen': {
      id: 'link-gen',
      kind: 'Generalize',
      sourceId: 'cls-empleado',
      targetId: 'cls-persona',
      labels: {},
      anchorSrc: null,
      anchorTgt: null,
    },
  },
}

/* =========================================================================
 * CASO 5 — Asociación binaria (Persona 1 ---- 0..* Mascota)
 * ========================================================================= */
export const case5_association: DiagramModel = {
  classes: {
    'cls-persona': {
      id: 'cls-persona',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Persona',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-mascota': {
      id: 'cls-mascota',
      x: 400,
      y: 100,
      w: 170,
      h: 80,
      name: 'Mascota',
      attributes: ['+ id: bigint'],
      methods: [],
    },
  },
  links: {
    'link-assoc': {
      id: 'link-assoc',
      kind: 'Associate',
      sourceId: 'cls-persona',
      targetId: 'cls-mascota',
      labels: { src: '1', tgt: '0..*' },
      anchorSrc: null,
      anchorTgt: null,
    },
  },
}

/* =========================================================================
 * CASO 6 — Agregación (rombo blanco)
 * ========================================================================= */
export const case6_aggregation: DiagramModel = {
  classes: {
    'cls-departamento': {
      id: 'cls-departamento',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Departamento',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-empleado': {
      id: 'cls-empleado',
      x: 400,
      y: 100,
      w: 170,
      h: 80,
      name: 'Empleado',
      attributes: ['+ id: bigint'],
      methods: [],
    },
  },
  links: {
    'link-aggr': {
      id: 'link-aggr',
      kind: 'Aggregate',
      sourceId: 'cls-departamento',
      targetId: 'cls-empleado',
      labels: { src: '1', tgt: '0..*' },
      anchorSrc: null,
      anchorTgt: null,
    },
  },
}

/* =========================================================================
 * CASO 7 — Composición (rombo negro)
 * ========================================================================= */
export const case7_composition: DiagramModel = {
  classes: {
    'cls-casa': {
      id: 'cls-casa',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Casa',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-habitacion': {
      id: 'cls-habitacion',
      x: 400,
      y: 100,
      w: 170,
      h: 80,
      name: 'Habitacion',
      attributes: ['+ id: bigint'],
      methods: [],
    },
  },
  links: {
    'link-comp': {
      id: 'link-comp',
      kind: 'Compose',
      sourceId: 'cls-casa',
      targetId: 'cls-habitacion',
      labels: { src: '1', tgt: '0..*' },
      anchorSrc: null,
      anchorTgt: null,
    },
  },
}

/* =========================================================================
 * CASO 8 — Dependencia
 * ========================================================================= */
export const case8_dependency: DiagramModel = {
  classes: {
    'cls-cliente': {
      id: 'cls-cliente',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Cliente',
      attributes: [],
      methods: [],
    },
    'cls-servicio': {
      id: 'cls-servicio',
      x: 400,
      y: 100,
      w: 170,
      h: 80,
      name: 'ServicioExterno',
      attributes: [],
      methods: [],
    },
  },
  links: {
    'link-dep': {
      id: 'link-dep',
      kind: 'Dependency',
      sourceId: 'cls-cliente',
      targetId: 'cls-servicio',
      labels: {},
      anchorSrc: null,
      anchorTgt: null,
    },
  },
}

/* =========================================================================
 * CASO 9 — Association Class
 * ========================================================================= */
export const case9_assocClass: DiagramModel = {
  classes: {
    'cls-persona': {
      id: 'cls-persona',
      x: 100,
      y: 100,
      w: 170,
      h: 80,
      name: 'Persona',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-mascota': {
      id: 'cls-mascota',
      x: 400,
      y: 100,
      w: 170,
      h: 80,
      name: 'Mascota',
      attributes: ['+ id: bigint'],
      methods: [],
    },
    'cls-adopcion': {
      id: 'cls-adopcion',
      x: 250,
      y: 250,
      w: 170,
      h: 100,
      name: 'Adopcion',
      attributes: ['+ fecha: date', '+ responsable: boolean'],
      methods: [],
    },
  },
  links: {
    'link-assoc-ac': {
      id: 'link-assoc-ac',
      kind: 'Associate',
      sourceId: 'cls-persona',
      targetId: 'cls-mascota',
      labels: { src: '1', tgt: '0..*' },
      anchorSrc: null,
      anchorTgt: null,
      assocClassId: 'cls-adopcion',
    },
  },
}

/* =========================================================================
 * CASO 10 — Round-trip (canvasToUml → umlToCanvas)
 * ========================================================================= */
export const case10_roundTripBase: DiagramModel = {
  classes: {
    'cls-A': {
      id: 'cls-A',
      x: 100,
      y: 100,
      w: 170,
      h: 120,
      name: 'A',
      attributes: ['+ id: bigint', '+ items: string [0..*]', '+ activo: boolean = true', '+ codigo: string {static}'],
      methods: ['+ login(u: string, p: string): boolean', '- calcular(): void {abstract}'],
    },
    'cls-B': {
      id: 'cls-B',
      x: 400,
      y: 100,
      w: 170,
      h: 100,
      name: 'B',
      attributes: ['+ id: bigint'],
      methods: [],
    },
  },
  links: {
    'link-AB': {
      id: 'link-AB',
      kind: 'Associate',
      sourceId: 'cls-A',
      targetId: 'cls-B',
      labels: { src: '1', tgt: '0..*' },
      anchorSrc: { side: 'R', t: 0.5 },
      anchorTgt: { side: 'L', t: 0.5 },
    },
  },
}
import { offlineService } from './services/offline.service'
import type { UmlDiagram } from './models/offline.models'

/** Manual browser integration check; it is not imported by the application. */
export async function runOfflineCrudExample(): Promise<void> {
  const uml: UmlDiagram = {
    classes: {
      persona: {
        id: 'persona', x: 0, y: 0, w: 170, h: 100, name: 'Persona', methods: [],
        attributes: [
          { vis: '+', name: 'id', type: 'Long' },
          { vis: '+', name: 'nombre', type: 'String' },
          { vis: '+', name: 'edad', type: 'Integer' },
        ],
      },
    },
    links: {},
  }
  const initialization = await offlineService.initializeFromUml(uml)
  if (initialization.status !== 'ready') throw new Error('El esquema existente requiere sincronización explícita.')
  await offlineService.remove('Persona', 3)
  await offlineService.insert('Persona', { id: 3, nombre: 'Pedro', edad: 25 })
  const inserted = await offlineService.findAll('Persona')
  if (inserted.length !== 1) throw new Error('INSERT/SELECT no devolvió el registro esperado.')
  await offlineService.update('Persona', 3, { nombre: 'Juan' })
  const updated = await offlineService.findById('Persona', 3)
  if (updated?.nombre !== 'Juan') throw new Error('UPDATE/SELECT BY ID no devolvió el registro esperado.')
  await offlineService.remove('Persona', 3)
  if (await offlineService.findById('Persona', 3)) throw new Error('DELETE no eliminó el registro.')
}

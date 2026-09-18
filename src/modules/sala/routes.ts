export default [
  {
    path: '',
    component: () => import('./pages/Salas.vue')
  }, {
    path: '/salas/:salaId/editor',
    name: 'SalaEditor',
    component: () => import('../editor/pages/Editor.vue'),
    props: true
  },

]

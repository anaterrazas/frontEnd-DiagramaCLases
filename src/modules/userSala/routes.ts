export default [
  {
    path: '',
    name: 'SalasCompartidas',
    component: () => import('./pages/UserSalas.vue')
  },
  {
    path: 'share/:salaId',
    name: 'ShareJoin',
    component: () => import('@/modules/userSala/pages/ShareJoin.vue'),
    props: true
  },

]

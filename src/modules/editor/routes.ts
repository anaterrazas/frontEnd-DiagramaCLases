export default [
  {
    path: 'offline-test',
    component: () => import('@/modules/offline/pages/OfflineTest.vue')
  },
  {
    path: '',
    component: () => import('./pages/Editor.vue')
  },


]

export default [
  {
    path: 'sign-in',
    name:'Login',
    component: () => import('./pages/SignIn.vue')
  },
    {
    path: 'sign-up',
    component: () => import('./pages/SignUp.vue')
  },

]

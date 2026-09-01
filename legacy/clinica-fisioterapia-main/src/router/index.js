import { createRouter, createWebHistory } from 'vue-router'

import Home from '../pages/Home.vue'
import Agendamento from '../pages/Agendamento.vue'
import Contato from '../pages/Contato.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/agendamento', component: Agendamento },
  { path: '/contato', component: Contato }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

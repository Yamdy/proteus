import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/chat",
  },
  {
    path: "/chat",
    name: "chat",
    component: () => import("../views/ChatView.vue"),
  },
  {
    path: "/config/level0",
    name: "config-level0",
    component: () => import("../views/ConfigLevel0View.vue"),
  },
  {
    path: "/config/level1",
    name: "config-level1",
    component: () => import("../views/ConfigLevel1View.vue"),
  },
  {
    path: "/config/level2",
    name: "config-level2",
    component: () => import("../views/ConfigLevel2View.vue"),
  },
  {
    path: "/self-modify",
    name: "self-modify",
    component: () => import("../views/SelfModifyView.vue"),
  },
  {
    path: "/observability",
    name: "observability",
    component: () => import("../views/ObservabilityView.vue"),
  },
  {
    path: "/costs",
    name: "costs",
    component: () => import("../views/CostsView.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

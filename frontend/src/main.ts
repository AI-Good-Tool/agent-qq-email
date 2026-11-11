import { createApp } from 'vue';
import ArcoVue from '@arco-design/web-vue';
import ArcoVueIcon from '@arco-design/web-vue/es/icon';
import '@arco-design/web-vue/dist/arco.css';
import './styles/theme.css';
import './styles/app.css';
import './stores/theme';
import App from './App.vue';

createApp(App).use(ArcoVue).use(ArcoVueIcon).mount('#app');

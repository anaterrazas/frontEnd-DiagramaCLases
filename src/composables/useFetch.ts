import { ref } from 'vue';
import client from '@/core/http/client';

export function useFetch<T = any>() {
  const data = ref<T | null>(null);
  const error = ref<any>(null);
  const loading = ref(false);

  const fetch = async (url: string, options?: object) => {
    loading.value = true;
    error.value = null;

    try {
      const response = await client.request({ url, ...options });
      data.value = response.data?.data || response.data;
    } catch (err: any) {
      error.value = err.response?.data || err.message;
    } finally {
      loading.value = false;
    }
  };

  return {
    data,
    error,
    loading,
    fetch,
  };
}

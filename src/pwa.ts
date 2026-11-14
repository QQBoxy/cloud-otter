if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/service-worker.js').catch((error: unknown) => {
    console.warn('無法啟用離線提示。', error)
  })
}

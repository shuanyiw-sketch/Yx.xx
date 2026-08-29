Component({
  properties: {
    service: { type: Object, value: {} },
  },
  methods: {
    book() {
      this.triggerEvent('book', { serviceId: this.data.service.id });
    },
  },
});

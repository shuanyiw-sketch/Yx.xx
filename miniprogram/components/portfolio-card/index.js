Component({
  properties: {
    item: { type: Object, value: {} },
  },
  methods: {
    open() {
      this.triggerEvent('open', { id: this.data.item.id });
    },
  },
});

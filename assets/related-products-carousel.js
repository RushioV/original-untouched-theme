if (!customElements.get('related-products-carousel')) {
  customElements.define(
    'related-products-carousel',
    class RelatedProductsCarousel extends HTMLElement {
      connectedCallback() {
        if (this.loaded) return;

        // Only request recommendations when the section is about to scroll into view
        this.observer = new IntersectionObserver(
          (entries, observer) => {
            if (!entries[0].isIntersecting) return;
            observer.disconnect();
            this.load();
          },
          { rootMargin: '0px 0px 400px 0px' }
        );
        this.observer.observe(this);
      }

      disconnectedCallback() {
        this.observer?.disconnect();
      }

      async load() {
        this.loaded = true;
        const limit = parseInt(this.dataset.limit, 10);
        const candidates = [...(await this.fetchRecommendations()), ...this.getTemplateItems('fallback')];

        // Recommendations first, then fallback products, without duplicates or the current product
        const seen = new Set([this.dataset.productId]);
        const items = [];
        for (const item of candidates) {
          if (items.length >= limit) break;
          if (seen.has(item.dataset.productId)) continue;
          seen.add(item.dataset.productId);
          items.push(item);
        }

        if (items.length === 0) {
          this.renderEmpty();
          return;
        }
        this.render(items);
      }

      async fetchRecommendations() {
        try {
          const response = await fetch(
            `${this.dataset.url}&product_id=${this.dataset.productId}&section_id=${this.dataset.sectionId}`
          );
          if (!response.ok) return [];

          const html = new DOMParser().parseFromString(await response.text(), 'text/html');
          return Array.from(html.querySelectorAll('[data-recommendations] > li'));
        } catch (error) {
          // Network issues shouldn't break the page, the fallback products are still shown
          return [];
        }
      }

      getTemplateItems(name) {
        const template = this.querySelector(`template[data-${name}]`);
        if (!template) return [];
        return Array.from(template.content.cloneNode(true).children).filter((child) => child.tagName === 'LI');
      }

      render(items) {
        const shell = this.querySelector('template[data-shell]').content.cloneNode(true);
        const sliderComponent = shell.querySelector('slider-component');
        const list = shell.querySelector('[data-list]');
        const count = items.length;

        const showMobileSlider = this.dataset.mobileSlider === 'true' && count > parseInt(this.dataset.columnsMobile, 10);
        const showDesktopSlider =
          this.dataset.desktopSlider === 'true' && count > parseInt(this.dataset.columnsDesktop, 10);
        const isSlider = showMobileSlider || showDesktopSlider;

        // Same classes the theme's featured collection section uses for its grid / slider layouts
        sliderComponent.classList.toggle('page-width', !showMobileSlider);
        sliderComponent.classList.toggle('page-width-desktop', !showDesktopSlider);
        sliderComponent.classList.toggle('slider-component-desktop', showDesktopSlider);
        list.classList.toggle('slider', isSlider);
        list.classList.toggle('slider--desktop', showDesktopSlider);
        list.classList.toggle('slider--tablet', showMobileSlider);
        list.classList.toggle('grid--peek', showMobileSlider);
        shell
          .querySelector('.title-wrapper')
          ?.classList.toggle('title-wrapper--self-padded-tablet-down', showMobileSlider);
        shell.querySelector('.title-wrapper')?.classList.toggle('collection__title--desktop-slider', showDesktopSlider);

        items.forEach((item, index) => {
          item.id = `Slide-${this.dataset.sectionId}-${index + 1}`;
          item.classList.toggle('slider__slide', isSlider);
          list.append(item);
        });

        if (isSlider) {
          shell.querySelector('.slider-counter--total').textContent = count;
        } else {
          shell.querySelector('.slider-buttons')?.remove();
        }

        this.querySelector('[data-content]').replaceChildren(shell);
      }

      renderEmpty() {
        // The empty message only exists in the theme editor, on the storefront the section stays hidden
        const empty = this.querySelector('template[data-empty]');
        if (empty) this.querySelector('[data-content]').replaceChildren(empty.content.cloneNode(true));
      }
    }
  );
}

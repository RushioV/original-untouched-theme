if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        // The carousel layout is driven by Swiper, see initCarousel()
        if (this.isCarouselLayout) return;
        if (!this.elements.thumbnails) return;

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
          mediaToSwitch
            .querySelector('button')
            .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
        });
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
      }

      get isCarouselLayout() {
        return this.dataset.desktopLayout === 'carousel';
      }

      connectedCallback() {
        if (this.isCarouselLayout) this.initCarousel();
      }

      disconnectedCallback() {
        this.variantChangeUnsubscriber?.();
        this.carousel?.destroy(true, true);
        this.thumbnailsCarousel?.destroy(true, true);
        this.carousel = null;
        this.thumbnailsCarousel = null;
      }

      initCarousel() {
        if (this.carousel || !this.elements.viewer) return;
        // Quick add only shows the first image, so it doesn't need a carousel
        if (this.closest('quick-add-modal')) return;
        // Swiper is loaded with 'defer', wait for it if this element was upgraded first
        if (typeof window.Swiper !== 'function') {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initCarousel(), { once: true });
          }
          return;
        }

        const container = this.querySelector('.product-carousel');
        const prevButton = this.querySelector('.product-carousel__button--prev');
        const nextButton = this.querySelector('.product-carousel__button--next');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const speed = reducedMotion ? 0 : 400;
        const slideCount = this.elements.viewer.querySelectorAll('.swiper-slide').length;
        // Like the reference, loop on desktop only. Swiper needs enough slides to loop without gaps.
        const loop = window.matchMedia('(min-width: 990px)').matches && slideCount >= 4;

        // Settings follow the reference carousel, adapted to this theme's 750px / 990px breakpoints
        if (this.elements.thumbnails) {
          this.thumbnailsCarousel = new Swiper(this.elements.thumbnails, {
            direction: 'horizontal',
            slidesPerView: 4.1,
            slidesPerGroup: 4,
            spaceBetween: 8,
            speed,
            watchSlidesProgress: true,
            mousewheel: { forceToAxis: true, releaseOnEdges: true },
            breakpoints: {
              750: { slidesPerView: 5 },
              990: { direction: 'vertical', slidesPerView: 'auto' },
            },
          });
        }

        this.carousel = new Swiper(this.elements.viewer, {
          initialSlide: parseInt(container?.dataset.initialSlide, 10) || 0,
          // Part of the next image is always visible as a swipe hint
          slidesPerView: 1.5,
          slidesPerGroup: 1,
          spaceBetween: 8,
          // Lines the first slide up with the page content while the carousel runs to the screen edges
          slidesOffsetBefore: 15,
          slidesOffsetAfter: 15,
          speed,
          loop,
          // Without loop, going past the last slide jumps back to the first one
          rewind: !loop,
          grabCursor: true,
          watchSlidesProgress: true,
          noSwipingSelector: 'product-model, model-viewer, video, iframe, input',
          // Each image is covered by the theme's lightbox <button>. Swiper ignores mouse drags that start
          // on focusable elements, so 'button' is left out here; clicks still open the lightbox.
          focusableElements: 'input, select, option, textarea, video, label',
          keyboard: { enabled: true, onlyInViewport: true },
          navigation: { prevEl: prevButton, nextEl: nextButton },
          thumbs: this.thumbnailsCarousel ? { swiper: this.thumbnailsCarousel } : undefined,
          a11y: {
            prevSlideMessage: prevButton?.getAttribute('aria-label'),
            nextSlideMessage: nextButton?.getAttribute('aria-label'),
          },
          breakpoints: {
            750: { slidesOffsetBefore: 0, slidesOffsetAfter: 0 },
            990: { slidesPerView: 1.25, spaceBetween: 16, slidesOffsetBefore: 0, slidesOffsetAfter: 0 },
          },
          on: {
            slideChange: this.onCarouselSlideChange.bind(this),
          },
        });

        if (typeof subscribe === 'function') {
          this.variantChangeUnsubscriber = subscribe(PUB_SUB_EVENTS.variantChange, ({ data }) =>
            this.onCarouselVariantChange(data)
          );
        }

        // Swiper's thumbs module only reacts to pointer taps, this also covers keyboard users
        this.elements.thumbnails?.querySelectorAll('[data-index]').forEach((thumbnail) => {
          thumbnail.querySelector('button').addEventListener('click', () => {
            this.carousel?.slideToLoop(parseInt(thumbnail.dataset.index, 10));
          });
        });
      }

      // Slides are identified by their original position (data-index): in loop mode Swiper moves them around.
      // Uses the instance passed by Swiper, as in loop mode 'slideChange' already fires while the
      // constructor is running (before this.carousel is assigned).
      getCarouselSlide(swiper, index) {
        return swiper.slides.find((slide) => parseInt(slide.dataset.index, 10) === index);
      }

      onCarouselSlideChange(swiper) {
        const activeSlide = this.getCarouselSlide(swiper, swiper.realIndex);
        if (!activeSlide) return;

        swiper.slides.forEach((slide) => slide.classList.toggle('is-active', slide === activeSlide));
        window.pauseAllMedia();

        const activeThumbnail = this.elements.thumbnails?.querySelector(`[data-index="${swiper.realIndex}"]`);
        if (activeThumbnail) {
          this.elements.thumbnails
            .querySelectorAll('button')
            .forEach((element) => element.removeAttribute('aria-current'));
          activeThumbnail.querySelector('button').setAttribute('aria-current', true);
        }
      }

      // Variants with their own image are handled by product-info.js through setActiveMedia().
      // For variants without one, show the first image whose alt text matches a selected option value (e.g. "Red").
      onCarouselVariantChange({ sectionId, variant } = {}) {
        if (!this.carousel || !variant || variant.featured_media) return;
        if (this.id !== `MediaGallery-${sectionId}`) return;

        const options = (variant.options || []).map((option) => String(option).trim().toLowerCase()).filter(Boolean);
        const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchesOption = (alt) =>
          options.some(
            (option) => alt === option || (option.length > 2 && new RegExp(`(^|\\W)${escape(option)}(\\W|$)`).test(alt))
          );

        const slide = Array.from(this.elements.viewer.querySelectorAll('[data-index]'))
          .sort((a, b) => a.dataset.index - b.dataset.index)
          .find((element) => matchesOption((element.dataset.mediaAlt || '').trim().toLowerCase()));
        if (slide) this.carousel.slideToLoop(parseInt(slide.dataset.index, 10));
      }

      setCarouselMedia(mediaId) {
        const activeMedia = this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`);
        if (!activeMedia) return;

        // Without Swiper (e.g. quick add) fall back to showing the variant's media first
        if (!this.carousel) {
          activeMedia.parentElement.prepend(activeMedia);
          return;
        }

        this.carousel.slideToLoop(parseInt(activeMedia.dataset.index, 10));

        // Bring the gallery into view (e.g. on mobile, where the variant picker sits below it)
        this.preventStickyHeader();
        const activeMediaRect = activeMedia.getBoundingClientRect();
        if (activeMediaRect.top > -0.5) return;
        window.scrollTo({ top: activeMediaRect.top + window.scrollY, behavior: 'smooth' });
      }

      onSlideChanged(event) {
        const thumbnail = this.elements.thumbnails.querySelector(
          `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      setActiveMedia(mediaId, prepend) {
        if (this.isCarouselLayout) return this.setCarouselMedia(mediaId);

        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');

        if (prepend) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        });
        this.playActiveMedia(activeMedia);

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}

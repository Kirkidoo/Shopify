if (!customElements.get("slideshow-component")) {
  customElements.define(
    "slideshow-component",
    class SlideshowComponent extends HTMLElement {
      constructor() {
        super();
        this.slideshow = this.querySelector(".slideshow");
      }

      connectedCallback() {
        const autoplayEnabled = this.getAttribute("data-autoplay") === "true";
        const autoPlaySpeed = parseInt(this.getAttribute("data-speed"), 10) * 1000;
        this.animationType = this.getAttribute("data-animation-type") ?? "slide";
        this.autoPlayEnabled = autoplayEnabled && autoPlaySpeed > 0;

        if (!this.slideshow) {
          return;
        }

        this.slideshow.style.display = "block";
        this.flickity = new Flickity(this.slideshow, {
          autoPlay: autoplayEnabled ? autoPlaySpeed : false,
          cellAlign: "left",
          percentPosition: true,
          fullscreen: true,
          contain: true,
          resize: true,
          draggable: true,
          prevNextButtons: false,
          fade: this.animationType === "fade",
          cellSelector: ".slideshow-slide",
          initialIndex: 0,
          pageDots: false,
          wrapAround: true,
          accessibility: false,
          on: {
            ready: () => {
              setTimeout(() => {
                this.preloadSlide(1);
              }, 3000);
            },
          },
        });

        this.flickity.on("change", (index) => {
          this.preloadSlide(index + 1);

          const event = new CustomEvent("slideshow:slide-change", {
            detail: {
              id: this.getAttribute("id"),
              index,
            },
          });
          document.dispatchEvent(event);
        });
      }

      preloadSlide(index) {
        const slide = this.querySelectorAll(".slideshow-slide")[index];

        if (slide) {
          const media = slide.querySelector(".slideshow-media");
          media.style.display = "block";

          const images = slide.querySelectorAll("img");
          [...images].forEach((image) => {
            image.loading = "";
          });
        }
      }
    },
  );
}

if (!customElements.get("slideshow-navigation")) {
  customElements.define(
    "slideshow-navigation",
    class SlideshowNavigation extends HTMLElement {
      constructor() {
        super();
        this.slideshow = this.closest("slideshow-component");
      }

      connectedCallback() {
        this.flickity = this.slideshow.flickity;

        // Pagination
        const buttons = this.querySelectorAll(".js-page");

        this.flickity.on("select", () => {
          buttons.forEach((button) => {
            button.classList.remove("is-active");
          });

          buttons[this.flickity.selectedIndex].classList.add("is-active");
        });

        buttons.forEach((button) => {
          button.addEventListener("click", () => {
            const index = [...buttons].findIndex((x) => x === button);
            this.flickity.select(index);
          });
        });

        // Next - Previous
        this.buttonPrev = this.querySelector(".js-prev");
        this.buttonNext = this.querySelector(".js-next");

        this.buttonPrev.addEventListener("click", (event) => {
          event.preventDefault();
          this.flickity.previous();
        });

        this.buttonNext.addEventListener("click", (event) => {
          event.preventDefault();
          this.flickity.next();
        });
      }
    },
  );
}

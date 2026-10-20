    const themeToggle = document.querySelector('.theme-toggle');
    const savedTheme = localStorage.getItem('mai-goro-theme');

    function setTheme(isDark) {
        document.body.classList.toggle('dark-mode', isDark);
        if (!themeToggle) return;
        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
        themeToggle.innerHTML = `<i class="fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}"></i>`;
    }

    setTheme(savedTheme === 'dark');
    themeToggle?.addEventListener('click', () => {
        const isDark = !document.body.classList.contains('dark-mode');
        localStorage.setItem('mai-goro-theme', isDark ? 'dark' : 'light');
        setTheme(isDark);
    });

    const navWrap = document.querySelector('#navWrap');
    const burger = document.querySelector('#burger');
    const mobilePanel = document.querySelector('#mobilePanel');

    function closeMobileMenu() {
        mobilePanel?.classList.remove('open');
        burger?.classList.remove('open');
        burger?.setAttribute('aria-expanded', 'false');
    }

    window.addEventListener('scroll', () => navWrap?.classList.toggle('scrolled', window.scrollY > 20), { passive: true });
    burger?.addEventListener('click', () => {
        const isOpen = mobilePanel.classList.toggle('open');
        burger.classList.toggle('open', isOpen);
        burger.setAttribute('aria-expanded', String(isOpen));
    });
    mobilePanel?.querySelectorAll('.nav-link, .nav-cta').forEach((link) => link.addEventListener('click', closeMobileMenu));
    document.addEventListener('click', (event) => {
        if (mobilePanel?.classList.contains('open') && !mobilePanel.contains(event.target) && !burger?.contains(event.target)) closeMobileMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMobileMenu();
    });

    const heroSlides = document.querySelectorAll('.hero-video-slide');
    const heroEyebrow = document.getElementById('hero-eyebrow');
    const heroTitle = document.getElementById('hero-title');
    const heroDescription = document.getElementById('hero-description');
    const heroSection = document.querySelector('.hero');
    const heroContentEl = document.querySelector('.hero-content');
    const heroPauseBtn = document.getElementById('heroPause');
    const HERO_INTERVAL = 6000;

    const heroContent = [
        {
            eyebrow: 'Creative services · Digital skills · Business support',
            title: 'Make your next move count.',
            description: 'Mai Goro e-Digital Solutions helps people and growing businesses look professional, work smarter and get essential digital tasks done.'
        },
        {
            eyebrow: 'Branding · Design · Growth',
            title: 'Turn your idea into a strong visual identity.',
            description: 'From logos and flyers to branded business materials, we design the look that helps your work stand out and convert attention into trust.'
        },
        {
            eyebrow: 'Training · Registration · Support',
            title: 'Practical digital support for real-world progress.',
            description: 'We help individuals and businesses move forward with training, registration support and reliable solutions that simplify everyday work.'
        },
        {
            eyebrow: 'Wide-format printing · Bold ideas · Clean finish',
            title: 'Print big. Stand out.',
            description: 'Turn your next idea into vivid banners and business graphics with Mai Goro wide-format printing in Kano.'
        }
    ];

    // Each hero message maps to a background slide (slides in DOM: video, video, printer image)
    const HERO_CONTENT_SLIDE = [0, 1, 0, 2];

    function initHeroVideoSlider() {
        if (!heroSlides.length) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let activeContentIndex = 0;
        let activeSlideIndex = 0;
        let heroTimer = null;
        let heroPaused = false;
        let heroInView = true;

        const playActiveVideo = () => {
            if (heroPaused) return;
            const video = heroSlides[activeSlideIndex]?.querySelector('video');
            if (!video) return;
            video.muted = true;
            video.play().catch(() => {});
        };
        const pauseAllVideos = () => {
            heroSlides.forEach((slide) => slide.querySelector('video')?.pause());
        };

        const showHeroSlide = (contentIndex, animate) => {
            activeContentIndex = contentIndex;
            activeSlideIndex = HERO_CONTENT_SLIDE[contentIndex] ?? 0;
            heroSection?.classList.toggle('printer-active', contentIndex === 3);
            heroSlides.forEach((slide, index) => {
                const isActive = index === activeSlideIndex;
                slide.classList.toggle('active', isActive);
                const video = slide.querySelector('video');
                if (!video) return;

                if (isActive) {
                    video.muted = true;
                    video.currentTime = 0;
                    video.play().catch(() => {});
                } else {
                    video.pause();
                }
            });

            if (heroEyebrow && heroTitle && heroDescription) {
                const content = heroContent[contentIndex] || heroContent[0];
                heroEyebrow.textContent = content.eyebrow;
                heroTitle.textContent = content.title;
                heroDescription.textContent = content.description;
            }

            if (animate && heroContentEl) {
                heroContentEl.classList.remove('swap');
                void heroContentEl.offsetWidth; // restart the CSS swap animation
                heroContentEl.classList.add('swap');
            }
        };

        const stopHeroTimer = () => { clearInterval(heroTimer); heroTimer = null; };
        const startHeroTimer = () => {
            stopHeroTimer();
            if (heroPaused || reducedMotion || !heroInView || document.hidden) return;
            heroTimer = setInterval(() => showHeroSlide((activeContentIndex + 1) % heroContent.length, true), HERO_INTERVAL);
        };

        if (reducedMotion) {
            // Respect prefers-reduced-motion: static hero (poster/first frame), no rotation
            heroSlides.forEach((slide) => {
                const video = slide.querySelector('video');
                if (!video) return;
                video.removeAttribute('autoplay');
                video.pause();
            });
            heroPauseBtn?.setAttribute('hidden', '');
        }

        showHeroSlide(0, false);
        startHeroTimer();

        heroPauseBtn?.addEventListener('click', () => {
            heroPaused = !heroPaused;
            heroPauseBtn.setAttribute('aria-pressed', String(heroPaused));
            heroPauseBtn.setAttribute('aria-label', heroPaused ? 'Resume background slideshow' : 'Pause background slideshow');
            heroPauseBtn.innerHTML = `<i class="fa-solid ${heroPaused ? 'fa-play' : 'fa-pause'}"></i>`;
            if (heroPaused) {
                stopHeroTimer();
                pauseAllVideos();
            } else {
                playActiveVideo();
                startHeroTimer();
            }
        });

        // Free CPU/GPU while the hero is off screen or the tab is hidden
        if ('IntersectionObserver' in window && heroSection) {
            new IntersectionObserver(([entry]) => {
                heroInView = entry.isIntersecting;
                if (heroInView) {
                    playActiveVideo();
                    startHeroTimer();
                } else {
                    stopHeroTimer();
                    pauseAllVideos();
                }
            }, { threshold: 0.1 }).observe(heroSection);
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopHeroTimer();
                pauseAllVideos();
            } else {
                playActiveVideo();
                startHeroTimer();
            }
        });
    }

    initHeroVideoSlider();

    const servicesHeroVideo = document.querySelector('.services-page-video');
    if (servicesHeroVideo && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        servicesHeroVideo.pause();
        servicesHeroVideo.removeAttribute('autoplay');
    }

    /* ---- Scroll-reveal animations ---- */
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length) {
        if ('IntersectionObserver' in window) {
            const revealObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('in-view');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

            revealEls.forEach((el) => revealObserver.observe(el));
        } else {
            revealEls.forEach((el) => el.classList.add('in-view'));
        }
    }

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        document.querySelectorAll('.service-card, .feature-card').forEach((card) => {
            card.addEventListener('pointermove', (event) => {
                const bounds = card.getBoundingClientRect();
                card.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`);
                card.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`);
            });
        });
    }

    /* ---- Auth nav button: show "My Portal" when a Supabase session exists ---- */
    (function initAuthNav() {
        let signedIn = false;
        try {
            signedIn = Object.keys(localStorage).some((key) => /^sb-.+-auth-token$/.test(key));
        } catch (e) { /* storage unavailable */ }
        if (!signedIn) return;
        document.querySelectorAll('.nav-auth').forEach((btn) => {
            btn.href = 'portal.html';
            btn.innerHTML = '<i class="fa-solid fa-user-check"></i> My Portal';
            btn.setAttribute('aria-label', 'Open my portal');
        });
    })();
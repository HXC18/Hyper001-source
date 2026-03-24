(function () {
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (window.Fluid && Fluid.events) {
    Fluid.events.registerScrollTopArrowEvent = function () {
      var topArrow = jQuery('#scroll-top-button');
      if (topArrow.length === 0) {
        return;
      }
      var board = jQuery('#board');
      if (board.length === 0) {
        return;
      }

      var posDisplay = false;
      var scrollDisplay = false;
      var pulling = false;
      var startY = 0;
      var pullDistance = 0;

      var setTopArrowPos = function () {
        var boardRight = board[0].getClientRects()[0].right;
        var bodyWidth = document.body.offsetWidth;
        var right = bodyWidth - boardRight;
        posDisplay = right >= 50;
        topArrow.css({
          right: (posDisplay ? right - 64 : 18) + 'px'
        });
        topArrow.toggleClass('is-visible', posDisplay && scrollDisplay);
      };

      setTopArrowPos();
      jQuery(window).resize(setTopArrowPos);

      var headerHeight = board.offset().top;
      Fluid.utils.listenScroll(function () {
        var scrollHeight = document.body.scrollTop + document.documentElement.scrollTop;
        scrollDisplay = scrollHeight >= headerHeight;
        topArrow.toggleClass('is-visible', posDisplay && scrollDisplay);
      });

      var pointerY = function (event) {
        if (event.touches && event.touches.length) {
          return event.touches[0].clientY;
        }
        if (event.changedTouches && event.changedTouches.length) {
          return event.changedTouches[0].clientY;
        }
        return event.clientY;
      };

      var resetPull = function () {
        pulling = false;
        pullDistance = 0;
        topArrow.removeClass('is-pulling');
        topArrow.css('transform', '');
      };

      var onMove = function (event) {
        if (!pulling) {
          return;
        }

        var currentY = pointerY(event);
        pullDistance = Math.max(0, Math.min(currentY - startY, 90));
        topArrow.css('transform', 'translateY(' + pullDistance + 'px)');

        if (event.cancelable) {
          event.preventDefault();
        }
      };

      var onEnd = function () {
        if (!pulling) {
          return;
        }

        var shouldTrigger = pullDistance > 36;
        resetPull();

        if (shouldTrigger) {
          jQuery('body,html').animate({
            scrollTop: 0,
            easing: 'swing'
          });
        }
      };

      topArrow.on('mousedown touchstart', function (event) {
        if (!topArrow.hasClass('is-visible')) {
          return;
        }

        pulling = true;
        startY = pointerY(event);
        pullDistance = 0;
        topArrow.addClass('is-pulling');

        if (event.cancelable) {
          event.preventDefault();
        }
      });

      jQuery(document).on('mousemove touchmove', onMove);
      jQuery(document).on('mouseup touchend touchcancel', onEnd);

      topArrow.on('click', function () {
        if (pullDistance > 0) {
          return;
        }
        jQuery('body,html').animate({
          scrollTop: 0,
          easing: 'swing'
        });
      });
    };
  }

  function forEachNode(selector, callback) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), callback);
  }

  function markRevealTargets() {
    var groups = [
      '.home-hero-panel',
      '.home-section-head',
      '.index-card',
      '.about-avatar',
      '.about-hero-card',
      '.about-panel',
      '.post-lead-card',
      '.post-prevnext article',
      '.archive li',
      '.list-group-item',
      '.category',
      '.category-sub',
      '.category-list-item',
      '.tagcloud a',
      '.post-content .markdown-body > *',
      '.post-content > hr',
      '.post-content > div'
    ];

    groups.forEach(function (selector) {
      forEachNode(selector, function (node, index) {
        if (node.classList.contains('reveal-item')) {
          return;
        }

        node.classList.add('reveal-item');
        node.style.setProperty('--reveal-delay', Math.min(index * 70, 420) + 'ms');
      });
    });
  }

  function showAllRevealTargets() {
    forEachNode('.reveal-item', function (node) {
      node.classList.add('is-visible');
    });
  }

  function setupRevealObserver() {
    markRevealTargets();

    if (prefersReducedMotion.matches || !('IntersectionObserver' in window)) {
      showAllRevealTargets();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.14,
      rootMargin: '0px 0px -8% 0px'
    });

    forEachNode('.reveal-item', function (node) {
      observer.observe(node);
    });
  }

  function updateNavbarState() {
    var navbar = document.getElementById('navbar');
    if (!navbar) {
      return;
    }

    if (window.scrollY > 12) {
      navbar.classList.add('nav-scrolled');
    } else {
      navbar.classList.remove('nav-scrolled');
    }
  }

  function setupAmbientMotion() {
    if (prefersReducedMotion.matches || window.matchMedia('(pointer: coarse)').matches) {
      return;
    }

    var root = document.documentElement;
    var ticking = false;
    var pointerX = window.innerWidth * 0.5;
    var pointerY = window.innerHeight * 0.35;

    var updateRootMotion = function () {
      ticking = false;
      root.style.setProperty('--ambient-x', (pointerX / window.innerWidth).toFixed(4));
      root.style.setProperty('--ambient-y', (pointerY / window.innerHeight).toFixed(4));
    };

    window.addEventListener('pointermove', function (event) {
      pointerX = event.clientX;
      pointerY = event.clientY;

      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateRootMotion);
      }
    }, { passive: true });

    var selectors = [
      '.home-hero-panel',
      '.index-card',
      '.about-hero-card',
      '.about-panel',
      '.post-lead-card',
      '.list-group',
      '.category',
      '.tagcloud a'
    ];

    selectors.forEach(function (selector) {
      forEachNode(selector, function (node) {
        node.classList.add('interactive-float');

        var frame = null;

        var applyMotion = function (rotateX, rotateY, lift) {
          node.style.transform = 'perspective(1200px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) translateY(' + lift + 'px)';
        };

        node.addEventListener('pointermove', function (event) {
          var rect = node.getBoundingClientRect();
          var px = (event.clientX - rect.left) / rect.width;
          var py = (event.clientY - rect.top) / rect.height;
          var rotateY = (px - 0.5) * 7;
          var rotateX = (0.5 - py) * 6;
          var lift = -4;

          node.style.setProperty('--pointer-x', (px * 100).toFixed(2) + '%');
          node.style.setProperty('--pointer-y', (py * 100).toFixed(2) + '%');

          if (frame) {
            window.cancelAnimationFrame(frame);
          }

          frame = window.requestAnimationFrame(function () {
            applyMotion(rotateX, rotateY, lift);
          });
        }, { passive: true });

        node.addEventListener('pointerleave', function () {
          node.style.removeProperty('--pointer-x');
          node.style.removeProperty('--pointer-y');
          node.style.transform = '';
        });
      });
    });
  }

  function setupScrollMotion() {
    var root = document.documentElement;
    var ticking = false;

    var updateScrollDepth = function () {
      ticking = false;
      var doc = document.documentElement;
      var maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
      var ratio = Math.min((window.scrollY || doc.scrollTop) / maxScroll, 1);
      root.style.setProperty('--scroll-depth', ratio.toFixed(4));
    };

    updateScrollDepth();
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateScrollDepth);
      }
    }, { passive: true });
  }

  function setupReadingMood() {
    var article = document.querySelector('.post-content .markdown-body');
    if (!article) {
      return;
    }

    var root = document.documentElement;
    var ticking = false;

    var updateReadingProgress = function () {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var total = Math.max(article.offsetHeight - window.innerHeight * 0.72, 1);
      var progress = Math.min(Math.max((window.innerHeight * 0.18 - rect.top) / total, 0), 1);
      root.style.setProperty('--article-progress', progress.toFixed(4));
    };

    updateReadingProgress();
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateReadingProgress);
      }
    }, { passive: true });
    window.addEventListener('resize', updateReadingProgress, { passive: true });
  }

  function setupHeroParticles() {
    if (prefersReducedMotion.matches) {
      return;
    }

    var hero = document.querySelector('.home-hero-panel');
    if (!hero || hero.querySelector('.hero-particles')) {
      return;
    }

    var layer = document.createElement('div');
    layer.className = 'hero-particles';

    for (var i = 0; i < 8; i++) {
      var particle = document.createElement('span');
      particle.className = 'hero-particle';
      particle.style.setProperty('--p-left', (8 + i * 11) + '%');
      particle.style.setProperty('--p-size', (i % 3 === 0 ? 7 : i % 3 === 1 ? 10 : 5) + 'px');
      particle.style.setProperty('--p-delay', (i * 0.9) + 's');
      particle.style.setProperty('--p-drift', ((i % 2 === 0 ? 1 : -1) * (12 + i * 2)) + 'px');
      particle.style.setProperty('--p-duration', (9 + (i % 4) * 2) + 's');
      layer.appendChild(particle);
    }

    hero.appendChild(layer);
  }

  function classifyCopiedText(text) {
    var value = (text || '').trim();
    if (!value) {
      return '复制内容成功';
    }

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return '复制邮箱地址成功';
    }

    if (/^https?:\/\/\S+$/i.test(value) || /^www\.\S+$/i.test(value)) {
      return '复制链接成功';
    }

    if (/^(?:\+?\d[\d\s-]{5,}\d)$/.test(value)) {
      return '复制号码成功';
    }

    if (value.includes('\n') || /[{}[\];=>]/.test(value)) {
      return '复制代码成功';
    }

    return '复制文字成功';
  }

  function showCopyToast(message) {
    var toast = document.getElementById('copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copy-toast';
      toast.className = 'copy-toast';
      toast.innerHTML = '<span class="copy-toast__dot"></span><span class="copy-toast__text"></span>';
      document.body.appendChild(toast);
    }

    var text = toast.querySelector('.copy-toast__text');
    text.textContent = message;

    toast.classList.remove('is-visible');
    window.clearTimeout(showCopyToast._timer);
    window.requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });

    showCopyToast._timer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1900);
  }

  function setupCopyFeedback() {
    var lastToastAt = 0;

    document.addEventListener('copy', function (event) {
      var now = Date.now();
      if (now - lastToastAt < 250) {
        return;
      }

      var text = '';
      if (event.clipboardData) {
        text = event.clipboardData.getData('text/plain');
      }

      if (!text) {
        var selection = window.getSelection();
        text = selection ? selection.toString() : '';
      }

      lastToastAt = now;
      showCopyToast(classifyCopiedText(text));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupRevealObserver();
    setupAmbientMotion();
    setupScrollMotion();
    setupReadingMood();
    setupHeroParticles();
    setupCopyFeedback();
    updateNavbarState();
    window.addEventListener('scroll', updateNavbarState, { passive: true });
  });
})();

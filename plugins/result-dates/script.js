// Result Dates - Client-side DOM injection
// Parses dates from snippets and adds badges to result cards
(function () {
  "use strict";

  // Date patterns to match
  const patterns = [
    // ISO: 2024-03-15, 2024/03/15
    {
      regex: /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
      parse: (match) => new Date(match[1].replace(/\//g, "-")),
    },
    // Written: Mar 4, 2026 | March 4, 2026 | 4 Mar 2026
    {
      regex:
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i,
      parse: (match) => new Date(match[1]),
    },
    {
      regex:
        /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i,
      parse: (match) => new Date(match[1]),
    },
    // Relative: 3 days ago, 1 month ago, 2 weeks ago, 1 year ago
    {
      regex: /\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i,
      parse: (match) => {
        const num = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const d = new Date();
        switch (unit) {
          case "second":
            d.setSeconds(d.getSeconds() - num);
            return d;
          case "minute":
            d.setMinutes(d.getMinutes() - num);
            return d;
          case "hour":
            d.setHours(d.getHours() - num);
            return d;
          case "day":
            d.setDate(d.getDate() - num);
            return d;
          case "week":
            d.setDate(d.getDate() - num * 7);
            return d;
          case "month":
            d.setMonth(d.getMonth() - num);
            return d;
          case "year":
            d.setFullYear(d.getFullYear() - num);
            return d;
          default:
            return null;
        }
      },
    },
    // Yesterday, today
    {
      regex: /\b(yesterday)\b/i,
      parse: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
      },
    },
    {
      regex: /\b(today)\b/i,
      parse: () => new Date(),
    },
  ];

  // Format date for display
  function formatDate(date) {
    if (!date || isNaN(date.getTime())) return null;

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Show relative for recent dates
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? "s" : ""} ago`;
    }

    // Show full date for older content
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // Extract date from text
  function extractDate(text) {
    if (!text) return null;

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        try {
          const date = pattern.parse(match);
          if (date && !isNaN(date.getTime())) {
            return {
              date,
              formatted: formatDate(date),
              original: match[0],
            };
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }
    return null;
  }

  // Get age category for color coding
  function getAgeBucket(date) {
    const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return "fresh";
    if (diffDays <= 90) return "recent";
    return "old";
  }

  // Inject date badge into a result card
  function injectDateBadge(resultEl, dateInfo) {
    // Don't add if already has our badge
    if (resultEl.querySelector(".result-date-badge")) return;

    const badge = document.createElement("span");
    badge.className = "result-date-badge";
    badge.dataset.age = getAgeBucket(dateInfo.date);
    badge.textContent = dateInfo.formatted;
    badge.title = dateInfo.date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Degoog result structure:
    //   div.result-item
    //     div.result-url-row  (favicon + cite.result-cite)
    //     a.result-title
    //     p.result-snippet
    //     div.result-engines
    const cite = resultEl.querySelector(".result-cite");

    if (cite) {
      cite.after(badge);
    } else {
      // Fallback: prepend to snippet
      const snippet = resultEl.querySelector(".result-snippet");
      if (snippet) {
        snippet.insertBefore(badge, snippet.firstChild);
      }
    }
  }

  // Process all results on the page
  function processResults() {
    const results = document.querySelectorAll(".result-item");

    results.forEach((result) => {
      // Skip if already processed
      if (result.dataset.dateProcessed) return;
      result.dataset.dateProcessed = "true";

      // Get snippet text and title
      const snippet =
        result.querySelector(".result-snippet")?.textContent || "";
      const title =
        result.querySelector(".result-title")?.textContent || "";

      // Try to extract date from snippet first, then title
      const dateInfo = extractDate(snippet) || extractDate(title);

      if (dateInfo) {
        injectDateBadge(result, dateInfo);
      }
    });
  }

  // Set up observer on #results-list (or body as fallback)
  function startObserver() {
    const target =
      document.getElementById("results-list") || document.body;

    const observer = new MutationObserver(() => {
      clearTimeout(window._resultDatesTimeout);
      window._resultDatesTimeout = setTimeout(processResults, 150);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });

    // Also process anything already present
    processResults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
})();

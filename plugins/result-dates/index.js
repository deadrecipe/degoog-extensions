// Result Dates Plugin for Degoog
// Extracts and displays dates prominently on search results

let template = "";

export const slot = {
  id: "result-dates",
  name: "Result Dates",
  position: "at-a-glance",

  // Trigger on all searches
  trigger(query) {
    return true;
  },

  init(ctx) {
    template = ctx.template;
  },

  async execute(query, context) {
    // We don't render anything in the at-a-glance slot itself
    // The script.js handles DOM injection into result cards
    // But we need this slot to ensure our script.js loads
    return { html: "" };
  },
};

export default slot;

const body = document.body;
const directionButtons = [...document.querySelectorAll("[data-direction-button]")];
const concepts = [...document.querySelectorAll("[data-concept]")];
const themeButton = document.querySelector("#theme-button");

function setDirection(direction) {
  body.dataset.direction = direction;
  directionButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.directionButton === direction);
  });
  concepts.forEach((concept) => {
    concept.hidden = concept.dataset.concept !== direction;
  });
}

function setTheme(theme) {
  body.dataset.theme = theme;
  themeButton.textContent = theme === "light" ? "查看深色" : "查看浅色";
}

directionButtons.forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.directionButton));
});

themeButton.addEventListener("click", () => {
  setTheme(body.dataset.theme === "light" ? "dark" : "light");
});

document.addEventListener("keydown", (event) => {
  if (["1", "2", "3", "4", "5", "6", "7"].includes(event.key)) {
    setDirection(["a", "b", "ab", "c", "d", "e", "bp"][Number(event.key) - 1]);
  }
  if (event.key.toLowerCase() === "d") {
    setTheme(body.dataset.theme === "light" ? "dark" : "light");
  }
});

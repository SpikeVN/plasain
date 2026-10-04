import { Show } from "solid-js";
import { dishImageSource, isDishImage, type Dish } from "../lib/api";

export default function DishCard(props: {
  dish: Dish;
  class?: string | Record<string, boolean>;
  loading?: "eager" | "lazy";
  onSelect?: () => void;
  onPointerDown?: () => void;
}) {
  return (
    <article
      class={["crystal-dish-card", props.class]}
      onClick={() => props.onSelect?.()}
      onPointerDown={() => props.onPointerDown?.()}
    >
      <div class="crystal-dish-image">
        <Show
          when={isDishImage(props.dish.image)}
          fallback={<span>{props.dish.image}</span>}
        >
          <img
            class="dish-photo"
            src={dishImageSource(props.dish.image)}
            width="362"
            height="362"
            loading={props.loading ?? "lazy"}
            decoding="async"
            alt=""
            draggable="false"
          />
        </Show>
      </div>
      <h2>{props.dish.name}</h2>
    </article>
  );
}

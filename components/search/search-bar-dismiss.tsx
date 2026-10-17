import React from "react";
import { Keyboard } from "react-native";

/**
 * Closes the keyboard of the native header search bar. The bar belongs to the
 * layout that declares `headerSearchBarOptions`, so the layout provides its
 * ref here and the results screen calls it on taps and scrolls. The native
 * bar is not an RN TextInput, so `Keyboard.dismiss()` alone does not reach it.
 */
const SearchBarDismissContext = React.createContext<() => void>(() =>
  Keyboard.dismiss(),
);

export function SearchBarDismissProvider({
  searchBarRef,
  children,
}: {
  searchBarRef: React.RefObject<any>;
  children: React.ReactNode;
}) {
  const dismiss = React.useCallback(() => {
    searchBarRef.current?.blur?.();
    Keyboard.dismiss();
  }, [searchBarRef]);
  return (
    <SearchBarDismissContext.Provider value={dismiss}>
      {children}
    </SearchBarDismissContext.Provider>
  );
}

export function useDismissSearchBar() {
  return React.useContext(SearchBarDismissContext);
}

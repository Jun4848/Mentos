

const MainPageNav = ({Id, Name}) => {
  return (
    <div className="w-screen h-[10vh] p-5 border-b-2 flex flex-row justify-between items-center">
        <h1>{Name || Id}</h1>
        
    </div>
  );
};

export default MainPageNav;

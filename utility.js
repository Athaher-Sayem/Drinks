const loadProducts = () => {
    fetch("https://www.thecocktaildb.com/api/json/v1/1/search.php?s=margarita")
        .then(res => res.json())
        .then(data => {
            displayProducts(data.drinks);
        })
        .catch(err => console.error(err));
};

const displayProducts = (products) => {
    const productCont = document.getElementById("product_cont");
    productCont.innerHTML = ""; 

    products.forEach(product => {
        const productDiv = document.createElement("div");
        productDiv.className = "product_card";

        productDiv.innerHTML = `

            <img src="${product.strDrinkThumb}" alt="${product.strDrink}" />
            <h3 class="font-bold color=red">${product.strDrink}</h3>
            <h4 class="font-bold">${product.price ? `$${product.price}` : "$10.00"}</h4>
            <p>${product.strInstructions.slice(0, 50)}...</p>
            <button class="view_details">View Details</button>
            <button class="add_to_cart">Add to Cart</button>

        `;

        const addBtn = productDiv.querySelector(".add_to_cart");
        addBtn.addEventListener("click", () => {
            addToCart(product.strDrink, product.price);
        });

        const viewBtn = productDiv.querySelector(".view_details");
        viewBtn.addEventListener("click", () => {
            showDetails(product.idDrink);
        });

        productCont.appendChild(productDiv);
    });
};

loadProducts();


const addToCart = (name, price) => {
    const cartCont = document.getElementById("cart_items");
    const cartItem = document.createElement("div");
    cartItem.className = "cart_item";
    cartItem.innerHTML = `
        <h4>${name}</h4>    
        <h4 class="price">$${price ? price : "10.00"}</h4>
    `;
    cart_items.appendChild(cartItem);


    totalPrice();
}

const totalPrice = () => {
    const allPrices = document.querySelectorAll(".price"); 
    let count = 0;
    allPrices.forEach(price => {
        count += parseFloat(price.innerText.replace("$", ""));
    });
    document.getElementById("total").innerText = `$${count.toFixed(2)}`;
};


const showDetails = (id) => {
    const url = `https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${id}`;
    const modalContainer = document.getElementById('modal-container');

    fetch(url)
        .then(res => res.json())
        .then(data => {
            const drink = data.drinks[0];

            
            const modalContentHTML = `
                <div class="modal-content">
                    <button class="modal-close-btn" onclick="closeModal()">&times;</button>
                    <h2>${drink.strDrink} Details</h2>
                    <p><strong>Category:</strong> ${drink.strCategory}</p>
                    <p><strong>Type:</strong> ${drink.strAlcoholic}</p>
                    <p><strong>Serve in:</strong> ${drink.strGlass}</p>
                    <h3>Instructions:</h3>
                    <p>${drink.strInstructions}</p>
                </div>
            `;

            
            modalContainer.innerHTML = modalContentHTML;
            modalContainer.classList.remove('hidden');

         
            modalContainer.onclick = (e) => {
                if (e.target.id === 'modal-container') {
                    closeModal();
                }
            };

        })
        .catch(err => {
            console.error(err);
            alert("Failed to load cocktail details.");
        });
};


const closeModal = () => {
    document.getElementById('modal-container').classList.add('hidden');
    document.getElementById('modal-container').innerHTML = '';
};



document.getElementById("search_btn").addEventListener("click", () => {
    const query = document.getElementById("search_input").value.trim(); 
    if (query) {
        fetch(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${query}`)
            .then(res => res.json())
            .then(data => {
                if (data.drinks) {
                    displayProducts(data.drinks);
                } else {
                    alert("No drinks found with that name.");
                }
            })
            .catch(err => console.error(err));
    }
});

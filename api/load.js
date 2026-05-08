// api/load.js - Backend API for gallery management
// This runs on your server, not in the browser

const GITHUB_TOKEN = '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'; // Replace with your actual GitHub token
const GITHUB_OWNER = 'mitalt735'; // Replace with your GitHub username
const GITHUB_REPO = 'website'; // Replace with your repo name
const FILE_PATH = 'index.html'; // Path to index.html in your repo

// For Vercel, we can't use fs.readFileSync at the module level
// The template will be loaded from GitHub instead

// Function to fetch current gallery data from GitHub
async function fetchGalleryFromGitHub() {
    try {
        console.log(`Fetching from GitHub: ${GITHUB_OWNER}/${GITHUB_REPO}/${FILE_PATH}`);
        
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            const error = await response.text();
            console.error('GitHub API error:', error);
            throw new Error(`Failed to fetch from GitHub: ${response.status}`);
        }

        const data = await response.json();
        console.log('GitHub file found:', data.name, 'Size:', data.size);
        
        // GitHub API has a size limit for content - files over 1MB need special handling
        if (data.size > 1000000) {
            console.log('File is large, using download URL instead');
            // For large files, fetch the raw content directly
            const rawResponse = await fetch(data.download_url);
            const content = await rawResponse.text();
            console.log('Downloaded raw content, length:', content.length);
            
            // Extract gallery data from HTML
            const galleryData = extractGalleryData(content);
            
            return {
                images: galleryData,
                sha: data.sha,
                content: content
            };
        } else {
            // For smaller files, use the base64 content
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            console.log('Decoded content length:', content.length);
            
            // Extract gallery data from HTML
            const galleryData = extractGalleryData(content);
            
            return {
                images: galleryData,
                sha: data.sha,
                content: content
            };
        }
    } catch (error) {
        console.error('Error fetching from GitHub:', error);
        throw error;
    }
}

// Function to update gallery data on GitHub
async function updateGalleryOnGitHub(newImages) {
    try {
        // Fetch current content from GitHub
        const currentData = await fetchGalleryFromGitHub();
        
        // Get current images and add new ones
        const existingImages = currentData.images || [];
        const allImages = [...existingImages, ...newImages];
        
        // Generate new HTML content with updated defaultImages
        const newContent = generateUpdatedHTMLForGitHub(allImages, currentData.content);
        
        // Update file on GitHub
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Update gallery: added ${newImages.length} new images`,
                    content: Buffer.from(newContent).toString('base64'),
                    sha: currentData.sha
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to update GitHub: ${errorData.message}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating GitHub:', error);
        throw error;
    }
}

// Generate updated HTML specifically for GitHub's index.html
function generateUpdatedHTMLForGitHub(images, originalContent) {
    console.log(`Generating updated HTML with ${images.length} images`);
    
    // Create the new images array string
    let imagesArrayString = '';
    if (images.length > 0) {
        imagesArrayString = images.map((img, index) => {
            // Escape single quotes in the src and alt to prevent JavaScript syntax errors
            const escapedSrc = img.src.replace(/'/g, "\\'");
            const escapedAlt = (img.alt || '').replace(/'/g, "\\'");
            
            // For very long base64 strings, we might need to format differently
            if (img.src.startsWith('data:')) {
                // For base64 data URLs, use template literals to handle long strings
                return `            { 
                src: '${escapedSrc}', 
                alt: '${escapedAlt}' 
            }`;
            } else {
                // For HTTP URLs, use the compact format
                return `            { src: '${escapedSrc}', alt: '${escapedAlt}' }`;
            }
        }).join(',\n');
    }
    
    // Build the new defaultImages array
    let newDefaultImages;
    if (images.length === 0) {
        // Empty array - keep it on one line
        newDefaultImages = `const defaultImages = [
        ];`;
    } else {
        // Array with images
        newDefaultImages = `const defaultImages = [
${imagesArrayString}
        ];`;
    }
    
    // Replace the defaultImages array in the original content
    // More flexible regex to match various formats
    const defaultImagesRegex = /const\s+defaultImages\s*=\s*\[[\s\S]*?\];/;
    
    if (!defaultImagesRegex.test(originalContent)) {
        console.error('Could not find defaultImages array in content!');
        throw new Error('defaultImages array not found in file');
    }
    
    const updatedContent = originalContent.replace(defaultImagesRegex, newDefaultImages);
    
    // Verify the replacement worked
    if (updatedContent === originalContent) {
        console.error('Content was not updated - regex replacement failed');
        throw new Error('Failed to update content');
    }
    
    console.log('Content updated successfully');
    
    // Safety check - make sure we didn't accidentally delete important content
    if (updatedContent.length < originalContent.length / 2) {
        console.warn(`Warning: New content (${updatedContent.length} chars) is much smaller than original (${originalContent.length} chars)`);
        // Check if defaultImages still exists
        if (!updatedContent.includes('const defaultImages = [')) {
            throw new Error('Safety check failed: defaultImages array was removed from content');
        }
    }
    
    return updatedContent;
}

// Function to replace all gallery images (for admin panel)
async function replaceAllGalleryImages(newImages) {
    try {
        // Fetch current content from GitHub to get SHA
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch from GitHub');
        }

        const data = await response.json();
        console.log('Current file on GitHub:', data.name, 'Size:', data.size);
        
        let content;
        // Handle large files
        if (data.size > 1000000) {
            console.log('File is large, fetching via download URL...');
            const rawResponse = await fetch(data.download_url);
            content = await rawResponse.text();
        } else {
            content = Buffer.from(data.content, 'base64').toString('utf-8');
        }
        
        console.log('Content length:', content.length);
        
        // Generate new HTML with replaced images
        const newContent = generateUpdatedHTMLForGitHub(newImages, content);
        
        // For large files, we need to ensure the content isn't too big for the API
        console.log('New content length:', newContent.length);
        
        // GitHub API has a limit of about 100MB for file content, but practically much less
        if (newContent.length > 50000000) { // 50MB limit for safety
            throw new Error(`File would be too large (${Math.round(newContent.length/1000000)}MB). Consider using image hosting instead of base64.`);
        }
        
        // Update file on GitHub
        const updatePayload = {
            message: `Admin update: replaced gallery with ${newImages.length} images`,
            content: Buffer.from(newContent).toString('base64'),
            sha: data.sha,
            branch: 'main'  // Specify the branch explicitly
        };
        
        console.log('Sending update to GitHub...');
        const updateResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatePayload)
            }
        );

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(`Failed to update GitHub: ${errorData.message}`);
        }

        return await updateResponse.json();
    } catch (error) {
        console.error('Error replacing gallery:', error);
        throw error;
    }
}

// Helper function to extract gallery data from HTML
function extractGalleryData(htmlContent) {
    const images = [];
    
    console.log('Extracting images from HTML content...');
    
    // Look for const defaultImages = [ with flexible spacing
    const scriptMatch = htmlContent.match(/const\s+defaultImages\s*=\s*\[([\s\S]*?)\];/);
    
    if (scriptMatch) {
        try {
            // Extract the array content
            const arrayContent = scriptMatch[1].trim();
            console.log('Found defaultImages array');
            
            // If array is empty, return empty array
            if (arrayContent.length === 0 || arrayContent === '') {
                console.log('defaultImages array is empty');
                return images;
            }
            
            // Log first part of content for debugging
            console.log('Array content preview:', arrayContent.substring(0, 200) + '...');
            
            // Match each image object - handle HTTP URLs and base64 data URLs
            // Updated regex to handle more flexible spacing and very long src values
            const imageRegex = /\{\s*src:\s*['"]([^'"]*?)['"](?:\s*,\s*alt:\s*['"]([^'"]*?)['"])?\s*\}/g;
            let match;
            let count = 0;
            
            while ((match = imageRegex.exec(arrayContent)) !== null) {
                const src = match[1];
                const alt = match[2] || '';
                
                // Validate that src is not empty and is either HTTP URL or data URL
                if (src && (src.startsWith('http') || src.startsWith('data:'))) {
                    images.push({
                        src: src,
                        alt: alt
                    });
                    count++;
                    // Only log first part of src if it's very long (base64)
                    const srcDisplay = src.length > 50 ? src.substring(0, 50) + '...' : src;
                    console.log(`Found image ${count}: ${srcDisplay} (alt: ${alt})`);
                } else {
                    console.log(`Skipping invalid src: ${src}`);
                }
            }
            
            // If no matches with the first pattern, try a more permissive pattern
            if (images.length === 0 && arrayContent.includes('src:')) {
                console.log('Trying more permissive pattern...');
                // This pattern allows for line breaks and very long URLs
                const flexibleRegex = /src:\s*['"]([^'"]*?)['"][\s\S]*?(?:alt:\s*['"]([^'"]*?)['"])?/g;
                while ((match = flexibleRegex.exec(arrayContent)) !== null) {
                    const src = match[1];
                    const alt = match[2] || '';
                    
                    if (src && (src.startsWith('http') || src.startsWith('data:'))) {
                        images.push({
                            src: src,
                            alt: alt
                        });
                        const srcDisplay = src.length > 50 ? src.substring(0, 50) + '...' : src;
                        console.log(`Found image (flexible): ${srcDisplay}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing defaultImages:', error);
        }
    } else {
        console.log('Pattern "const defaultImages = [" not found in HTML');
    }
    
    console.log(`Total images extracted: ${images.length}`);
    return images;
}

// Helper function removed - generateUpdatedHTMLForGitHub is used instead

// API endpoint handler (for Vercel)
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    

    
    // Check if GitHub token is set for other operations
    if (!GITHUB_TOKEN || GITHUB_TOKEN === 'YOUR_GITHUB_TOKEN_HERE') {
        console.error('GITHUB_TOKEN is not configured - please add your token to load.js');
        res.status(500).json({
            success: false,
            error: 'Server configuration error: GitHub token not configured in load.js'
        });
        return;
    }
    
    if (req.method === 'GET') {
        try {
            console.log('Fetching gallery from GitHub...');
            
            // Check if this is a debug request
            if (req.query.debug === 'true') {
                const results = {};
                
                // Check multiple possible files
                const filesToCheck = ['hayden.html', 'index.html'];
                
                for (const fileName of filesToCheck) {
                    try {
                        const response = await fetch(
                            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${fileName}`,
                            {
                                headers: {
                                    'Authorization': `token ${GITHUB_TOKEN}`,
                                    'Accept': 'application/vnd.github.v3+json'
                                }
                            }
                        );
                        
                        if (response.ok) {
                            const data = await response.json();
                            let hasDefaultImages = false;
                            let snippet = 'Not checked - file too large';
                            
                            // Handle both small and large files
                            try {
                                let content = '';
                                if (data.size < 1000000) {
                                    // Small file - use base64 content
                                    content = Buffer.from(data.content, 'base64').toString('utf-8');
                                } else {
                                    // Large file - use download URL
                                    console.log(`Fetching large file ${fileName} via download URL...`);
                                    const rawResponse = await fetch(data.download_url);
                                    content = await rawResponse.text();
                                }
                                
                                hasDefaultImages = content.includes('const defaultImages = [');
                                if (hasDefaultImages) {
                                    const startIdx = content.indexOf('const defaultImages = [');
                                    snippet = content.substring(startIdx, Math.min(startIdx + 500, content.length));
                                } else {
                                    snippet = 'defaultImages not found in file';
                                }
                            } catch (e) {
                                snippet = `Error processing file: ${e.message}`;
                            }
                            
                            results[fileName] = {
                                exists: true,
                                size: data.size,
                                hasDefaultImages,
                                snippet
                            };
                        } else {
                            results[fileName] = {
                                exists: false,
                                error: `HTTP ${response.status}`
                            };
                        }
                    } catch (error) {
                        results[fileName] = {
                            exists: false,
                            error: error.message
                        };
                    }
                }
                
                return res.json({
                    success: true,
                    debug: true,
                    currentFilePath: FILE_PATH,
                    files: results
                });
            }
            
            // Try to fetch from GitHub
            const data = await fetchGalleryFromGitHub();
            console.log(`Returning ${data.images.length} images`);
            res.json({
                success: true,
                images: data.images
            });
        } catch (error) {
            console.error('GET error:', error);
            console.error('Stack trace:', error.stack);
            res.status(500).json({
                success: false,
                error: 'Failed to load gallery: ' + error.message
            });
        }
    } else if (req.method === 'POST') {
        try {
            const { images } = req.body;
            console.log(`POST request received with ${images ? images.length : 0} images`);
            
            if (!images || !Array.isArray(images)) {
                throw new Error('Invalid request: images array required');
            }
            
            // Log image info for debugging
            images.forEach((img, index) => {
                const srcType = img.src.startsWith('data:') ? 'base64' : 'url';
                const srcSize = img.src.length;
                console.log(`Image ${index + 1}: ${srcType} (${srcSize} chars) - ${img.alt}`);
            });
            
            await updateGalleryOnGitHub(images);
            res.json({
                success: true,
                message: `Gallery updated successfully with ${images.length} images`
            });
        } catch (error) {
            console.error('POST error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update gallery: ' + error.message
            });
        }
    } else if (req.method === 'PUT') {
        // PUT method for replacing all images (admin panel)
        try {
            const { images, replace } = req.body;
            if (!images || !Array.isArray(images)) {
                throw new Error('Invalid request: images array required');
            }
            
            // For PUT with replace=true, we replace all images
            if (replace) {
                await replaceAllGalleryImages(images);
            } else {
                await updateGalleryOnGitHub(images);
            }
            
            res.json({
                success: true,
                message: 'Gallery replaced successfully'
            });
        } catch (error) {
            console.error('PUT error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to replace gallery: ' + error.message
            });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}

// For Vercel serverless functions
module.exports = handler;
